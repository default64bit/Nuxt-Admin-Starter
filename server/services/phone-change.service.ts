import { timingSafeEqual } from "node:crypto";
import type { OtpRequestResponse } from "../../shared/schemas/auth";
import type { Db } from "../database/types";
import type { SmsLocale, SmsProvider } from "../notifications/providers";
import * as sessions from "../repositories/auth-sessions.repository";
import * as challenges from "../repositories/otp-challenges.repository";
import * as sendEvents from "../repositories/otp-send-events.repository";
import * as users from "../repositories/users.repository";
import { DomainError, serviceUnavailable, tooManyRequests, validationFailed } from "../utils/domain-errors";
import { recordAudit } from "./admin-audit.service";
import { generateOtpCode, MAX_OTP_ATTEMPTS } from "./auth.service";
import {
  IP_LIMITS,
  LONGEST_WINDOW_SECONDS,
  OTP_LIFETIME_SECONDS,
  PHONE_CHANGE_USER_LIMITS,
  PHONE_LIMITS,
  RESEND_INTERVAL_SECONDS,
  resendRetryAfter,
  rollingLimitRetryAfter,
} from "./otp-limits";

// Changing the sign-in phone (users-and-roles spec, "My account"). Two steps, both for the signed-in User only:
// `requestPhoneChange` sends a code to the new number and `verifyPhoneChange` swaps the number once the code is
// right. The request path never reveals whether the number is taken; that is only said at verification, after the
// User proved they hold it.

export interface PhoneChangeDeps {
  db: Db;
  sms: SmsProvider;
  now: () => Date;
  randomInt: (maxExclusive: number) => number;
  /** The single startup boolean from `server/utils/auth-config.ts`; no other code decides. */
  exposeTestCode: boolean;
}

export interface PhoneChangeRequestArgs {
  userId: string;
  /** Already normalized to `+989XXXXXXXXX`. */
  phone: string;
  locale: SmsLocale;
  /** HMAC of the caller's IP; the raw address never reaches the service. */
  ipHash: string;
}

/** `+989123456789` -> `+98•••••6789`: enough to tell two numbers apart, not enough to dial. */
const maskPhone = (phone: string) => `${phone.slice(0, 3)}•••••${phone.slice(-4)}`;

const currentPhone = () => validationFailed({ phone: ["current_phone"] });

/**
 * Sends a code to the new number. The answer is the same for registered, unregistered and disabled numbers.
 * Sends count in the sign-in per-phone and per-IP buckets and in the per-User hourly cap; a request by another
 * User for the same number replaces the earlier challenge.
 */
export async function requestPhoneChange(args: PhoneChangeRequestArgs, deps: PhoneChangeDeps): Promise<OtpRequestResponse> {
  const { db, sms, now, randomInt } = deps;
  let smsFailed = false;
  let response!: OtpRequestResponse;

  await db.transaction(async (tx) => {
    const account = await users.findPhoneById(tx, args.userId);
    if (!account || account.status === "disabled") throw new DomainError(401, "Unauthorized", "unauthenticated");
    if (account.phoneE164 === args.phone) throw currentPhone();

    // One request per User and per number at a time, so concurrent calls cannot both pass the limits.
    await challenges.lockUser(tx, args.userId);
    await challenges.lockPhone(tx, args.phone);

    const at = now();
    const since = new Date(at.getTime() - LONGEST_WINDOW_SECONDS * 1000);
    const phoneSends = await sendEvents.recentSendTimesForPhone(tx, args.phone, since);
    const tooSoon = resendRetryAfter(phoneSends, at);
    if (tooSoon !== null) throw tooManyRequests("otp_resend_too_soon", tooSoon);

    const ipSends = await sendEvents.recentSendTimesForIp(tx, args.ipHash, since);
    const userSends = await sendEvents.recentSendTimesForUser(tx, args.userId, since);
    const limited = Math.max(
      rollingLimitRetryAfter(phoneSends, at, PHONE_LIMITS) ?? 0,
      rollingLimitRetryAfter(ipSends, at, IP_LIMITS) ?? 0,
      rollingLimitRetryAfter(userSends, at, PHONE_CHANGE_USER_LIMITS) ?? 0,
    );
    if (limited > 0) throw tooManyRequests("otp_rate_limited", limited);

    let challenge = await challenges.findActivePhoneChange(tx, args.phone);
    // Another User's challenge for this number is replaced; so is one that can no longer be used.
    if (challenge && (challenge.userId !== args.userId || challenge.expiresAt <= at || challenge.code === null)) {
      await challenges.invalidate(tx, challenge.id, at);
      challenge = null;
    }
    // One live code per User: asking for a different number closes the earlier challenge.
    await challenges.invalidateUserPhoneChanges(tx, args.userId, at, args.phone);
    challenge ??= await challenges.insertPhoneChange(tx, {
      phoneE164: args.phone,
      userId: args.userId,
      code: generateOtpCode(randomInt),
      issuedAt: at,
      expiresAt: new Date(at.getTime() + OTP_LIFETIME_SECONDS * 1000),
    });
    const code = challenge.code!;

    // A disabled account takes the identical path but skips the provider, like an undelivered SMS.
    const status = await users.findStatusByPhone(tx, args.phone);
    if (status !== "disabled") {
      const delivered = await sms
        .sendOtp({ locale: args.locale, recipient: args.phone, code })
        .then((result) => result.ok)
        .catch(() => false);
      if (!delivered) {
        // A failed send is not counted and does not move the last-sent time; the challenge stays.
        smsFailed = true;
        return;
      }
    }

    await sendEvents.record(tx, { phoneE164: args.phone, ipHash: args.ipHash, sentAt: at, userId: args.userId });
    await challenges.touchLastSent(tx, challenge.id, at);

    response = {
      phone: args.phone,
      expiresIn: Math.max(1, Math.ceil((challenge.expiresAt.getTime() - at.getTime()) / 1000)),
      resendIn: RESEND_INTERVAL_SECONDS,
      ...(deps.exposeTestCode ? { testCode: code } : {}),
    };
  });

  if (smsFailed) throw serviceUnavailable("sms_unavailable");
  return response;
}

export interface PhoneChangeVerifyArgs {
  userId: string;
  /** The session making the change; it is the only one of the User's sessions that stays valid. */
  sessionId: string;
  phone: string;
  /** Five ASCII digits. */
  code: string;
  /** The request id, written into the audit event as its correlation id. */
  requestId?: string | undefined;
}

export interface PhoneChangeVerifyDeps {
  db: Db;
  now: () => Date;
}

type VerifyOutcome = { kind: "ok" } | { kind: "error"; error: DomainError };

const codesMatch = (expected: string, given: string) => {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
};
const failed = (code: "otp_incorrect" | "otp_expired" | "otp_attempts_exceeded"): VerifyOutcome => ({
  kind: "error",
  error: new DomainError(422, "Unprocessable Entity", code),
});
// No account id here: the answer must not tell who holds the number.
const phoneInUse = (): VerifyOutcome => ({ kind: "error", error: new DomainError(409, "Conflict", "phone_in_use") });

/** Walks the `cause` chain: Drizzle wraps the driver error. */
function isUniqueViolation(error: unknown): boolean {
  for (let current = error as { code?: string; cause?: unknown } | undefined, depth = 0; current && depth < 5; depth += 1) {
    if (current.code === "23505") return true;
    current = current.cause as typeof current;
  }
  return false;
}

/**
 * Completes the change with the right code. Failures are committed first (the attempt count must persist) and
 * thrown afterwards. A number that belongs to another account is refused only here, after the code proved the User
 * holds it. On success, in one transaction: the phone is replaced and verified, the challenge is consumed and every
 * other session of the User is revoked.
 */
export async function verifyPhoneChange(args: PhoneChangeVerifyArgs, deps: PhoneChangeVerifyDeps): Promise<{ phone: string }> {
  const { db, now } = deps;

  const outcome = await db.transaction(async (tx): Promise<VerifyOutcome> => {
    await challenges.lockPhone(tx, args.phone);
    const at = now();

    const challenge = await challenges.findActivePhoneChange(tx, args.phone);
    // A challenge asked for by someone else is none of this caller's business: it is neither probed nor charged an attempt.
    if (!challenge || challenge.userId !== args.userId) return failed("otp_expired");
    if (challenge.expiresAt <= at || challenge.code === null) {
      await challenges.invalidate(tx, challenge.id, at);
      return failed("otp_expired");
    }

    const attempts = await challenges.incrementAttempts(tx, challenge.id);
    if (!codesMatch(challenge.code, args.code)) {
      if (attempts >= MAX_OTP_ATTEMPTS) {
        await challenges.invalidate(tx, challenge.id, at);
        return failed("otp_attempts_exceeded");
      }
      return failed("otp_incorrect");
    }

    const account = await users.findPhoneById(tx, args.userId);
    if (!account) throw new DomainError(401, "Unauthorized", "unauthenticated");
    const holder = await users.findByPhone(tx, args.phone);
    if (holder?.id === args.userId) {
      await challenges.invalidate(tx, challenge.id, at);
      return { kind: "error", error: currentPhone() };
    }
    if (holder) {
      await challenges.invalidate(tx, challenge.id, at);
      return phoneInUse();
    }

    // A savepoint, so a lost race on the unique phone index leaves the transaction usable.
    try {
      await tx.transaction((savepoint) => users.changePhone(savepoint, args.userId, args.phone, at));
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      await challenges.invalidate(tx, challenge.id, at);
      return phoneInUse();
    }

    await challenges.consume(tx, challenge.id, at);
    await challenges.invalidateUserPhoneChanges(tx, args.userId, at);
    await sessions.revokeAllForUserExcept(tx, args.userId, args.sessionId, "phone_changed", at);
    // Both numbers are masked: the log says that the number changed, not what it was.
    await recordAudit(
      tx,
      { actorUserId: args.userId, correlationId: args.requestId },
      { action: "account.change_phone", entityType: "user", entityId: args.userId, changeSummary: { old: { phone: maskPhone(account.phoneE164) }, new: { phone: maskPhone(args.phone) } } },
    );
    return { kind: "ok" };
  });

  if (outcome.kind === "error") throw outcome.error;
  return { phone: args.phone };
}

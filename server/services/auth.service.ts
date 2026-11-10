import { createHash, timingSafeEqual } from "node:crypto";
import type { Db } from "../database/types";
import type { OtpRequestResponse } from "../../shared/schemas/auth";
import type { SmsLocale, SmsProvider } from "../notifications/providers";
import * as sessions from "../repositories/auth-sessions.repository";
import * as challenges from "../repositories/otp-challenges.repository";
import * as sendEvents from "../repositories/otp-send-events.repository";
import * as users from "../repositories/users.repository";
import { DomainError, serviceUnavailable, tooManyRequests } from "../utils/domain-errors";
import { recordAudit } from "./admin-audit.service";
import {
  IP_LIMITS,
  LONGEST_WINDOW_SECONDS,
  OTP_LIFETIME_SECONDS,
  PHONE_LIMITS,
  RESEND_INTERVAL_SECONDS,
  resendRetryAfter,
  rollingLimitRetryAfter,
} from "./otp-limits";
import { absoluteExpiryFrom, idleExpiryFrom } from "./session-policy";

export interface AuthServiceDeps {
  db: Db;
  sms: SmsProvider;
  /** Injected so tests control time. */
  now: () => Date;
  /** Uniform integer in `[0, maxExclusive)` from a cryptographically secure source. */
  randomInt: (maxExclusive: number) => number;
  /** The single startup boolean from `server/utils/auth-config.ts`; no other code decides. */
  exposeTestCode: boolean;
}

export interface OtpRequestArgs {
  /** Already normalized to `+989XXXXXXXXX`. */
  phone: string;
  locale: SmsLocale;
  /** HMAC of the caller's IP; the raw address never reaches the service. */
  ipHash: string;
}

/** Five ASCII digits, leading zeros preserved. */
export function generateOtpCode(randomInt: AuthServiceDeps["randomInt"]): string {
  return String(randomInt(100_000)).padStart(5, "0");
}

/**
 * Issues a sign-in code or re-sends the active one (there is no separate resend). The response is identical for
 * a known phone, an unknown phone and a disabled account, and for new versus reused codes. Only an active
 * account is sent an SMS; the others take the identical path with the provider call skipped, so they cannot be
 * told apart from an undelivered SMS. Nothing here creates an account.
 */
export async function requestOtp(args: OtpRequestArgs, deps: AuthServiceDeps): Promise<OtpRequestResponse> {
  const { db, sms, now, randomInt } = deps;
  let smsFailed = false;
  let response!: OtpRequestResponse;

  await db.transaction(async (tx) => {
    // One request per phone at a time, so concurrent calls cannot both pass the limits.
    await challenges.lockPhone(tx, args.phone);

    const at = now();
    const since = new Date(at.getTime() - LONGEST_WINDOW_SECONDS * 1000);
    const phoneSends = await sendEvents.recentSendTimesForPhone(tx, args.phone, since);

    // The interval is measured from the last actual send, not the challenge row, so it holds across invalidation.
    const tooSoon = resendRetryAfter(phoneSends, at);
    if (tooSoon !== null) throw tooManyRequests("otp_resend_too_soon", tooSoon);

    const ipSends = await sendEvents.recentSendTimesForIp(tx, args.ipHash, since);
    const limited = Math.max(rollingLimitRetryAfter(phoneSends, at, PHONE_LIMITS) ?? 0, rollingLimitRetryAfter(ipSends, at, IP_LIMITS) ?? 0);
    if (limited > 0) throw tooManyRequests("otp_rate_limited", limited);

    let challenge = await challenges.findActiveLogin(tx, args.phone);
    if (challenge && (challenge.expiresAt <= at || challenge.code === null)) {
      await challenges.invalidate(tx, challenge.id, at);
      challenge = null;
    }
    challenge ??= await challenges.insertLogin(tx, {
      phoneE164: args.phone,
      code: generateOtpCode(randomInt),
      issuedAt: at,
      expiresAt: new Date(at.getTime() + OTP_LIFETIME_SECONDS * 1000),
    });
    const code = challenge.code!;

    const account = await users.findByPhone(tx, args.phone);
    if (account?.status === "active") {
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

    await sendEvents.record(tx, { phoneE164: args.phone, ipHash: args.ipHash, sentAt: at });
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

export const MAX_OTP_ATTEMPTS = 10;

export interface VerifyOtpDeps {
  db: Db;
  now: () => Date;
  /** Cryptographically secure random bytes, injected for tests. */
  randomBytes: (size: number) => Buffer;
}

export interface VerifyOtpArgs {
  phone: string;
  /** Five ASCII digits. */
  code: string;
  userAgent: string | null;
  /** Hash of the session token this browser already holds, if any; it is revoked on success. */
  currentTokenHash?: string | null;
  /** The request id, written into the audit event as its correlation id. */
  requestId?: string | undefined;
}

export interface VerifiedSession {
  /** Opaque token for the cookie; only its hash is stored. */
  token: string;
  tokenHash: string;
  userId: string;
  absoluteExpiresAt: Date;
}

export const hashSessionToken = (token: string): string => createHash("sha256").update(token).digest("hex");

function codesMatch(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

type VerifyOutcome = { kind: "ok"; session: VerifiedSession } | { kind: "error"; code: "otp_incorrect" | "otp_expired" | "otp_attempts_exceeded" };

/**
 * Stateless verification: phone + code identify the challenge. Failures are committed first (the attempt count
 * must persist) and thrown afterwards. On success the challenge is consumed and the session row is inserted in
 * one transaction. A phone without an active account never signs in: after a correct code it gets the ordinary
 * `otp_incorrect`, so verification does not reveal who has an account either.
 */
export async function verifyOtp(args: VerifyOtpArgs, deps: VerifyOtpDeps): Promise<VerifiedSession> {
  const { db, now, randomBytes } = deps;

  const outcome = await db.transaction(async (tx): Promise<VerifyOutcome> => {
    await challenges.lockPhone(tx, args.phone);
    const at = now();

    const challenge = await challenges.findActiveLogin(tx, args.phone);
    if (!challenge) return { kind: "error", code: "otp_expired" };
    if (challenge.expiresAt <= at || challenge.code === null) {
      await challenges.invalidate(tx, challenge.id, at);
      return { kind: "error", code: "otp_expired" };
    }

    const attempts = await challenges.incrementAttempts(tx, challenge.id);
    const user = await users.findByPhone(tx, args.phone);
    const accepted = codesMatch(challenge.code, args.code) && user?.status === "active";

    if (!accepted) {
      if (attempts >= MAX_OTP_ATTEMPTS) {
        await challenges.invalidate(tx, challenge.id, at);
        return { kind: "error", code: "otp_attempts_exceeded" };
      }
      return { kind: "error", code: "otp_incorrect" };
    }

    await challenges.consume(tx, challenge.id, at);
    if (!user.phoneVerifiedAt) await users.markPhoneVerified(tx, user.id, at);

    // Signing in while signed in replaces this browser's session; other devices keep theirs.
    if (args.currentTokenHash) await sessions.revokeByTokenHash(tx, args.currentTokenHash, "replaced", at);

    const token = randomBytes(32).toString("base64url");
    const absoluteExpiresAt = absoluteExpiryFrom(at);
    const tokenHash = hashSessionToken(token);
    await sessions.insert(tx, {
      userId: user.id,
      tokenHash,
      createdAt: at,
      lastSeenAt: at,
      idleExpiresAt: idleExpiryFrom(at),
      absoluteExpiresAt,
      userAgent: args.userAgent ? args.userAgent.slice(0, 255) : null,
    });
    await recordAudit(tx, { actorUserId: user.id, correlationId: args.requestId }, { action: "auth.sign_in", entityType: "user", entityId: user.id, changeSummary: { method: "otp" } });
    return { kind: "ok", session: { token, tokenHash, userId: user.id, absoluteExpiresAt } };
  });

  if (outcome.kind === "error") {
    throw new DomainError(422, "Unprocessable Entity", outcome.code);
  }
  return outcome.session;
}

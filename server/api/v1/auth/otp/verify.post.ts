import { randomBytes } from "node:crypto";
import { otpVerifySchema } from "../../../../../shared/schemas/auth";
import { verifyOtp } from "../../../../services/auth.service";
import { resolveSession, toSessionPayload } from "../../../../services/session.service";
import { sessionCookieSecure } from "../../../../utils/auth-config";
import { currentTokenHash } from "../../../../utils/auth-session";
import { requestLogger } from "../../../../utils/logger";
import { parseBody } from "../../../../utils/parse-body";

// Thin route: validate, verify, set the protected cookie. The body is never logged.
export default defineEventHandler(async (event) => {
  const body = await parseBody(event, otpVerifySchema);
  const config = useRuntimeConfig(event);
  const log = requestLogger(event);
  const db = useDb();
  const now = () => new Date();

  try {
    const session = await verifyOtp(
      { phone: body.phone, code: body.code, userAgent: getRequestHeader(event, "user-agent") ?? null, currentTokenHash: await currentTokenHash(event) },
      { db, now, randomBytes },
    );

    // Cookie Max-Age counts down to the database record's absolute expiry; it never outlives it.
    const maxAge = Math.max(1, Math.floor((session.absoluteExpiresAt.getTime() - now().getTime()) / 1000));
    await replaceUserSession(
      event,
      { user: { id: session.userId }, secure: { token: session.token } },
      { maxAge, cookie: { httpOnly: true, sameSite: "lax", secure: sessionCookieSecure(config.appEnv, config.public.siteUrl), path: "/" } },
    );
    log.info("otp_verify", { outcome: "signed_in" });
    return toSessionPayload(await resolveSession(session.tokenHash, { db, now }));
  } catch (error) {
    const outcome = (error as { data?: { code?: string } }).data?.code ?? "internal_error";
    log.info("otp_verify", { outcome });
    throw error;
  }
});

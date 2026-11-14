import { effectiveSmsProvider } from "../notifications/providers";

/**
 * The one startup boolean that decides whether `otp/request` may return the code (`testCode`): only the mock SMS
 * adapter, which is the default in `local` and `test`, in `local` or `test`. Staging with the mock adapter, and
 * every other combination, exposes nothing. No other code decides.
 */
export function exposeTestCode(appEnv: string | undefined, smsProvider: string | undefined): boolean {
  return effectiveSmsProvider(smsProvider, appEnv) === "mock" && (appEnv === "local" || appEnv === "test");
}

/**
 * `Secure` on every HTTPS deployment: always in staging and production; only `local` and `test` over plain
 * http may drop it, because browsers such as Safari discard Secure cookies there.
 */
export function sessionCookieSecure(appEnv: string | undefined, siteUrl: string | undefined): boolean {
  if (appEnv === "local" || appEnv === "test") return (siteUrl ?? "").startsWith("https://");
  return true;
}

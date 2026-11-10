/**
 * Error capture for the GlitchTip Optional piece (ADR-0015). Pure helpers shared by the client and server
 * Sentry configs: an empty or malformed DSN means "not configured", in which case the SDK is never initialised
 * and nothing is sent.
 */

export interface ParsedDsn {
  origin: string;
  key: string;
  projectId: string;
}

/** Split a Sentry-compatible DSN (`https://<key>@<host>/<project>`), or undefined when it is empty or malformed. */
export function parseDsn(dsn: string | undefined | null): ParsedDsn | undefined {
  if (!dsn || !dsn.trim()) return undefined;
  try {
    const url = new URL(dsn.trim());
    const projectId = url.pathname.split("/").filter(Boolean).pop();
    if (!/^https?:$/.test(url.protocol) || !url.username || !projectId) return undefined;
    return { origin: url.origin, key: url.username, projectId };
  } catch {
    return undefined;
  }
}

// Phone numbers (7+ digits, optionally grouped or with a leading +) and `otp=`, `code:`, `token=`, `password=` style pairs.
const PHONE = /(?<![\w.])\+?\d(?:[\s().-]?\d){6,}(?![\w])/g;
const SECRET_PAIR = /\b(otp|code|token|password|secret|authorization)\b(\s*[:=]\s*)("[^"]*"|'[^']*'|\S+)/gi;

/** Redact phone numbers and OTP, token or password values from free text. */
export function scrubText(text: string): string {
  return text.replace(SECRET_PAIR, "$1$2[redacted]").replace(PHONE, "[phone]");
}

const SENSITIVE_HEADERS = new Set(["cookie", "set-cookie", "authorization", "proxy-authorization", "x-csrf-token"]);

// The subset of the Sentry event shape the scrubber touches, so it stays a plain function that is easy to test.
interface ScrubbableEvent {
  message?: string;
  user?: unknown;
  request?: {
    url?: string;
    query_string?: unknown;
    cookies?: unknown;
    data?: unknown;
    headers?: Record<string, string>;
  };
  exception?: { values?: Array<{ value?: string }> };
  breadcrumbs?: Array<{ message?: string; data?: unknown }>;
}

/**
 * `beforeSend` / `beforeBreadcrumb` scrubber (ADR-0015): no request bodies, cookies, auth headers, query strings or
 * user identity leave the app, and phone numbers and OTP or token values are redacted from messages.
 */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  delete event.user;
  if (event.message) event.message = scrubText(event.message);
  for (const value of event.exception?.values ?? []) {
    if (value.value) value.value = scrubText(value.value);
  }
  for (const crumb of event.breadcrumbs ?? []) {
    if (crumb.message) crumb.message = scrubText(crumb.message);
    delete crumb.data;
  }
  const request = event.request;
  if (request) {
    delete request.cookies;
    delete request.data;
    delete request.query_string;
    if (request.url) request.url = request.url.split(/[?#]/)[0];
    if (request.headers) {
      request.headers = Object.fromEntries(Object.entries(request.headers).filter(([name]) => !SENSITIVE_HEADERS.has(name.toLowerCase())));
    }
  }
  return event;
}

export interface CaptureInput {
  dsn: string | undefined | null;
  environment?: string;
}

/**
 * Options for `Sentry.init`, or undefined when the DSN is empty or malformed (not configured: the caller must not
 * init). Errors only: no tracing sample rate, no replay, no default PII.
 */
export function buildCaptureOptions(input: CaptureInput) {
  if (!parseDsn(input.dsn)) return undefined;
  return {
    dsn: input.dsn!.trim(),
    ...(input.environment ? { environment: input.environment } : {}),
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: <T extends ScrubbableEvent>(crumb: T): T => scrubEvent({ ...crumb }),
  };
}

/** Initialise the SDK through `init` only when the DSN is usable; returns whether capture is on. */
export function initErrorCapture(init: (options: NonNullable<ReturnType<typeof buildCaptureOptions>>) => unknown, input: CaptureInput): boolean {
  const options = buildCaptureOptions(input);
  if (!options) return false;
  init(options);
  return true;
}

import { localizedPath } from "./locale-path";
import { isPrivatePagePath } from "./route-rules";

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

/** Where a signed-in User lands when sign-in carries no return path. */
export const SIGNED_IN_HOME = "/admin";

/** Why a guest was sent to sign-in; the page explains it. Only `session-ended` exists. */
export const SIGN_IN_REASONS = ["session-ended"] as const;
export type SignInReason = (typeof SIGN_IN_REASONS)[number];

export const parseSignInReason = (value: unknown): SignInReason | null => (SIGN_IN_REASONS as readonly unknown[]).includes(value) ? (value as SignInReason) : null;

function bare(path: string): { locale: "fa" | "en"; path: string } {
  const pathname = path.split(/[?#]/, 1)[0] ?? "";
  const segments = pathname.split("/").filter(Boolean);
  const locale = segments[0] === "en" ? "en" : "fa";
  if (locale === "en") segments.shift();
  return { locale, path: `/${segments.join("/")}` };
}

/** The locale a path is written in: `/en/...` is English, everything else the default. */
export const pathLocale = (path: string): "fa" | "en" => bare(path).locale;

/** The sign-in page itself, in either locale (a trailing slash is tolerated). */
export const isSignInPath = (path: string): boolean => {
  const { path: p } = bare(path);
  return p === "/sign-in" || p.startsWith("/sign-in/");
};

/**
 * The only accepted shape is a same-origin path with a single leading `/`: no scheme, no `//`, no backslash,
 * no control characters (also after one round of percent-decoding), and never the sign-in page itself.
 * Anything else becomes `fallback`.
 */
export function sanitizeReturnPath(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string" || !raw.startsWith("/")) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  for (const value of [raw, decoded]) {
    if (value.startsWith("//") || value.includes("\\") || CONTROL.test(value)) return fallback;
  }
  if (isSignInPath(raw)) return fallback;
  return raw;
}

export interface PrivateRouteInput {
  /** Request path as received, with any locale prefix. */
  path: string;
  /** Raw query string including the leading `?`, or an empty string. */
  search: string;
  /** The `redirect` query value, when the path is the sign-in page. */
  redirect: unknown;
  signedIn: boolean;
  /** The request carried a session that is no longer valid (expired, revoked or disabled). */
  sessionEnded?: boolean;
}

/** The sign-in URL for a guest who tried to open `target`, carrying why when the session ended. */
export function signInUrl(target: string, locale: "fa" | "en", reason?: SignInReason | null): string {
  const query = [`redirect=${encodeURIComponent(target)}`, ...(reason ? [`reason=${reason}`] : [])].join("&");
  return `${localizedPath("/sign-in", locale)}?${query}`;
}

/**
 * Where the server should 302 a page request, or null to continue. Every page except the landing page and
 * sign-in is private (`PRIVATE_PAGES`), so a guest, or a visitor whose session ended, opening one goes to
 * `/sign-in?redirect=<path>`; a signed-in visitor opening sign-in goes to the sanitized `redirect`.
 */
export function privateRouteRedirect(input: PrivateRouteInput): string | null {
  const { locale } = bare(input.path);
  if (isSignInPath(input.path)) {
    return input.signedIn ? sanitizeReturnPath(input.redirect, localizedPath(SIGNED_IN_HOME, locale)) : null;
  }
  if (input.signedIn || !isPrivatePagePath(input.path)) return null;
  return signInUrl(`${input.path}${input.search}`, locale, input.sessionEnded ? "session-ended" : null);
}

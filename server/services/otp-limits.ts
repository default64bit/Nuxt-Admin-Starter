// Pure rolling-window arithmetic for OTP sends (.specs/authentication/spec.md). Windows slide with the
// clock and never create permanent blocks: a limit lifts as soon as the oldest counted send ages out.

export const RESEND_INTERVAL_SECONDS = 30;
export const OTP_LIFETIME_SECONDS = 120;

export interface RollingLimit {
  windowSeconds: number;
  max: number;
}

export const PHONE_LIMITS: readonly RollingLimit[] = [
  { windowSeconds: 3600, max: 5 },
  { windowSeconds: 86_400, max: 10 },
];

export const IP_LIMITS: readonly RollingLimit[] = [
  { windowSeconds: 3600, max: 30 },
  { windowSeconds: 86_400, max: 100 },
];

/** At most this many phone-change code sends per signed-in user per hour. */
export const PHONE_CHANGE_USER_LIMITS: readonly RollingLimit[] = [{ windowSeconds: 3600, max: 5 }];

/** Longest window across all limits: how far back send events have to be read. */
export const LONGEST_WINDOW_SECONDS = 86_400;

const seconds = (ms: number) => Math.max(1, Math.ceil(ms / 1000));

/** Seconds until the 30-second resend interval is satisfied, or null when a send is allowed now. */
export function resendRetryAfter(sendTimesNewestFirst: Date[], now: Date): number | null {
  const last = sendTimesNewestFirst[0];
  if (!last) return null;
  const waitMs = last.getTime() + RESEND_INTERVAL_SECONDS * 1000 - now.getTime();
  return waitMs > 0 ? seconds(waitMs) : null;
}

/**
 * Seconds until the most restrictive exceeded limit lifts, or null when none is exceeded.
 * `sendTimesNewestFirst` must hold every send inside the longest window.
 */
export function rollingLimitRetryAfter(
  sendTimesNewestFirst: Date[],
  now: Date,
  limits: readonly RollingLimit[],
): number | null {
  let retryAfter: number | null = null;
  for (const { windowSeconds, max } of limits) {
    const windowStart = now.getTime() - windowSeconds * 1000;
    const inWindow = sendTimesNewestFirst.filter((time) => time.getTime() > windowStart);
    if (inWindow.length < max) continue;
    // Allowed again once the `max`-th most recent send leaves the window.
    const blocking = inWindow[max - 1]!;
    const wait = seconds(blocking.getTime() + windowSeconds * 1000 - now.getTime());
    retryAfter = Math.max(retryAfter ?? 0, wait);
  }
  return retryAfter;
}

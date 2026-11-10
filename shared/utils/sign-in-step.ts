export type SavedStep =
  | { kind: "code"; phone: string; resendAt: number; expiresAt: number }
  | { kind: "expired"; phone: string };

/**
 * Reads the per-tab sign-in step. Inside the two-minute window it resumes the code step with its
 * remaining time; after expiry it yields the expired state with the number kept. Malformed data is
 * ignored. The code itself is never stored.
 */
export function parseSavedStep(raw: string | null | undefined, now: number): SavedStep | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<{ phone: string; expiresAt: number; resendAt: number }> | null;
    if (!value || typeof value.phone !== "string" || typeof value.expiresAt !== "number" || typeof value.resendAt !== "number") {
      return null;
    }
    return value.expiresAt > now
      ? { kind: "code", phone: value.phone, resendAt: value.resendAt, expiresAt: value.expiresAt }
      : { kind: "expired", phone: value.phone };
  } catch {
    return null;
  }
}

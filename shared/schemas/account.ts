import { z } from "zod";
import { requiredOrInvalid } from "./issue-messages";

// Any control character (C0, DEL, C1; this includes tab and newline) is refused before whitespace is collapsed.
// Format characters such as the Persian zero-width non-joiner are not control characters and stay.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
export const PERSON_NAME_MAX_LENGTH = 50;

/**
 * A given or family name (users-and-roles spec, "My account"): trimmed, inner whitespace collapsed to single
 * spaces, 1 to 50 characters (counted as characters, not UTF-16 units), no control characters, no script
 * restriction. Failure messages are stable keys the client maps to copy.
 */
export const personNameSchema = z.string(requiredOrInvalid).transform((value, ctx) => {
  if (CONTROL.test(value)) {
    ctx.addIssue({ code: "custom", message: "control_characters" });
    return z.NEVER;
  }
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned === "") {
    ctx.addIssue({ code: "custom", message: "required" });
    return z.NEVER;
  }
  if ([...cleaned].length > PERSON_NAME_MAX_LENGTH) {
    ctx.addIssue({ code: "custom", message: "too_long" });
    return z.NEVER;
  }
  return cleaned;
});

/** `PATCH /api/v1/admin/account`: both names, nothing else (a stray key such as `phone` is refused). */
export const accountUpdateSchema = z.object({ givenName: personNameSchema, familyName: personNameSchema }).strict();
export type AccountUpdateInput = z.infer<typeof accountUpdateSchema>;

/** `GET`/`PATCH /api/v1/admin/account`: names are null until the User sets them; the phone is canonical `+989XXXXXXXXX`. */
export interface AccountResponse {
  givenName: string | null;
  familyName: string | null;
  phone: string;
}

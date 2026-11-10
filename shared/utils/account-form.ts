import { accountUpdateSchema } from "../schemas/account";

export type NameField = "givenName" | "familyName";
export type NameValues = Record<NameField, string>;
export type NameErrorKey = "required" | "too_long" | "control_characters" | "invalid";
export type NameErrors = Partial<Record<NameField, NameErrorKey>>;

const ERROR_KEYS: readonly string[] = ["required", "too_long", "control_characters", "invalid"];
const FIELDS: readonly NameField[] = ["givenName", "familyName"];
const isErrorKey = (value: string | undefined): value is NameErrorKey => value !== undefined && ERROR_KEYS.includes(value);

export type NameValidation = { ok: true; values: NameValues; errors: Record<string, never> } | { ok: false; errors: NameErrors };

/** The shared name schema applied to the form: cleaned values when valid, else the error key per field. */
export function validateNames(input: NameValues): NameValidation {
  const parsed = accountUpdateSchema.safeParse(input);
  if (parsed.success) return { ok: true, values: parsed.data, errors: {} };
  const errors: NameErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as NameField | undefined;
    if (field && FIELDS.includes(field) && !errors[field] && isErrorKey(issue.message)) errors[field] = issue.message;
  }
  return { ok: false, errors };
}

/** Save is enabled only when the form is valid and (once cleaned) differs from what is saved. */
export function canSave(input: NameValues, saved: { givenName: string | null; familyName: string | null }): boolean {
  const result = validateNames(input);
  if (!result.ok) return false;
  return result.values.givenName !== (saved.givenName ?? "") || result.values.familyName !== (saved.familyName ?? "");
}

/** Maps the API's `fieldErrors` onto the two name fields; keys the form does not know are dropped. */
export function fieldErrorsFromServer(fieldErrors: Record<string, string[]> | undefined): NameErrors {
  const errors: NameErrors = {};
  for (const field of FIELDS) {
    const key = fieldErrors?.[field]?.[0];
    if (isErrorKey(key)) errors[field] = key;
  }
  return errors;
}

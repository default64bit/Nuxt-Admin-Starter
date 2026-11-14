import type { z } from "zod";

// Zod 4 has one `error` option where Zod 3 had `required_error`, `invalid_type_error` and `errorMap`. These keep
// the codes clients read (`required`, `invalid`, ...) byte-for-byte what Zod 3 produced.

type ErrorOption = { error: z.core.$ZodErrorMap };

const keyMessage = (issue: z.core.$ZodRawIssue) => (issue.code === "invalid_key" ? issue.issues[0]?.message : undefined);

/**
 * The messages of a schema's own wrong-type issue, as Zod 3's `required_error` (the value is missing, `undefined`)
 * and `invalid_type_error` (any other wrong type) gave them; one left out keeps Zod's default. The schema's checks
 * keep their own messages, and a record's rejected key keeps its key schema's message.
 */
export function typeError({ required, invalid }: { required?: string; invalid?: string }): ErrorOption {
  return {
    error: (issue) => {
      // Zod 4 also asks a schema's `error` about its checks' issues (and `.int()` reports `invalid_type`).
      if (issue.inst !== issue.schema) return undefined;
      if (issue.code !== "invalid_type") return keyMessage(issue);
      return issue.input === undefined ? required : invalid;
    },
  };
}

/** The usual pair: a missing value is `required`, a value of the wrong type `invalid`. */
export const requiredOrInvalid = typeError({ required: "required", invalid: "invalid" });

/** A record's rejected key keeps its key schema's message (Zod 4 otherwise reports a generic `invalid_key`). */
export const recordKeyError: ErrorOption = { error: keyMessage };

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { recordKeyError, requiredOrInvalid, typeError } from "../../../shared/schemas/issue-messages";

/** `path: message` for every issue, the way `parseBody` turns them into field errors. */
const messages = (schema: z.ZodType, value: unknown) => schema.safeParse(value).error?.issues.map((issue) => `${issue.path.join(".")}:${issue.message}`) ?? [];

// The codes clients read must stay what Zod 3's `required_error`/`invalid_type_error`/`errorMap` produced.
describe("schema type-error messages", () => {
  it("names a missing value `required` and a value of the wrong type `invalid`", () => {
    const body = z.object({ name: z.string(requiredOrInvalid) });
    expect(messages(body, {})).toEqual(["name:required"]);
    expect(messages(body, { name: 3 })).toEqual(["name:invalid"]);
  });

  it("keeps Zod's default for a missing value when only `invalid` is given", () => {
    const [message] = messages(z.object({ enabled: z.boolean(typeError({ invalid: "invalid" })) }), {});
    expect(message).not.toBe("enabled:invalid");
    expect(messages(z.object({ enabled: z.boolean(typeError({ invalid: "invalid" })) }), { enabled: 1 })).toEqual(["enabled:invalid"]);
  });

  it("leaves a check's own message alone, and its default when it has none", () => {
    expect(messages(z.number(requiredOrInvalid).int("not_whole"), 1.5)).toEqual([":not_whole"]);
    expect(messages(z.number(requiredOrInvalid).int(), 1.5)).not.toEqual([":invalid"]);
    expect(messages(z.string(requiredOrInvalid).min(2), "a")).not.toEqual([":invalid"]);
    expect(messages(z.string(requiredOrInvalid).datetime({ offset: true, message: "invalid" }), "soon")).toEqual([":invalid"]);
  });

  it("reports a record's rejected key with its key schema's message", () => {
    expect(messages(z.record(z.uuid("invalid"), z.number(), recordKeyError), { size: 1 })).toEqual(["size:invalid"]);
    expect(messages(z.record(z.uuid("invalid"), z.number(), requiredOrInvalid), { size: 1 })).toEqual(["size:invalid"]);
    expect(messages(z.object({ prices: z.record(z.uuid("invalid"), z.number(), requiredOrInvalid) }), {})).toEqual(["prices:required"]);
  });
});

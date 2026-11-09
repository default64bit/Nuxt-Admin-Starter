import { createError, readBody, type H3Event } from "h3";
import type { z } from "zod";

/** Validates a JSON body at the route boundary; failures use the standard `validation_failed` body, with field errors keyed by the full path (`detailRows.0.labelFa`). */
export async function parseBody<T extends z.ZodType>(event: H3Event, schema: T): Promise<z.output<T>> {
  const parsed = schema.safeParse(await readBody(event));
  if (parsed.success) return parsed.data;
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    (fieldErrors[issue.path.join(".") || "body"] ??= []).push(issue.message);
  }
  throw createError({
    statusCode: 400,
    statusMessage: "Bad Request",
    data: { code: "validation_failed", fieldErrors },
  });
}

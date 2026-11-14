import { createError, getQuery, type H3Event } from "h3";
import type { z } from "zod";

/** Validates the query string at the route boundary; failures use the standard `validation_failed` body. */
export function parseQuery<T extends z.ZodType>(event: H3Event, schema: T): z.output<T> {
  const parsed = schema.safeParse(getQuery(event));
  if (parsed.success) return parsed.data;
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of parsed.error.issues) {
    (fieldErrors[issue.path.join(".") || "query"] ??= []).push(issue.message);
  }
  throw createError({
    statusCode: 400,
    statusMessage: "Bad Request",
    data: { code: "validation_failed", fieldErrors },
  });
}

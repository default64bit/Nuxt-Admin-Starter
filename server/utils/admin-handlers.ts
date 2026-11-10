import { getRouterParam, type H3Event } from "h3";
import { z } from "zod";
import { DomainError } from "./domain-errors";

/** A `:id` route parameter that must be a uuid; anything else cannot name a record, so it is a 404. */
export function uuidParam(event: H3Event, name = "id"): string {
  const parsed = z.uuid().safeParse(getRouterParam(event, name));
  if (!parsed.success) throw new DomainError(404, "Not Found", "not_found");
  return parsed.data;
}

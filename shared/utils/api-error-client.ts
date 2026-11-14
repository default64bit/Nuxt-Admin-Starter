export interface ParsedApiError {
  /** `data.code` of the standard error body, when the server answered. */
  code: string | null;
  retryAfter: number | null;
  status: number | null;
  /** No response at all (offline, DNS, aborted). */
  network: boolean;
}

interface FetchErrorLike {
  status?: number;
  statusCode?: number;
  response?: unknown;
  data?: { data?: { code?: unknown; retryAfter?: unknown } } | null;
}

/** Reads an ofetch error into the standard `{ statusCode, statusMessage, data: { code, retryAfter } }` shape. */
export function parseApiError(error: unknown): ParsedApiError {
  const value = (error ?? {}) as FetchErrorLike;
  const status = value.status ?? value.statusCode ?? null;
  const code = value.data?.data?.code;
  const retryAfter = value.data?.data?.retryAfter;
  return {
    code: typeof code === "string" ? code : null,
    retryAfter: typeof retryAfter === "number" && retryAfter > 0 ? retryAfter : null,
    status,
    network: status === null && !value.response,
  };
}

/** `data.fieldErrors` of the standard error body (field to message codes), or an empty object. */
export function parseFieldErrors(error: unknown): Record<string, string[]> {
  const raw = (error as { data?: { data?: { fieldErrors?: unknown } } } | null)?.data?.data?.fieldErrors;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const result: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(raw)) {
    if (Array.isArray(messages) && messages.every((message) => typeof message === "string")) result[field] = messages as string[];
  }
  return result;
}

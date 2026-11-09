/**
 * Standard error body for `/api/v1` (ADR-0015):
 * `{ statusCode, statusMessage, data: { code, fieldErrors? } }`. No stack, SQL or internal
 * message ever reaches the body of a 5xx.
 */
export interface ApiErrorBody {
  statusCode: number;
  statusMessage: string;
  data: {
    code: string;
    retryAfter?: number;
    fieldErrors?: Record<string, string[]>;
    /** Stable keys of unmet requirements, or the `{ key, needs }` pairs a role lacks (`permission_prerequisites`). */
    missing?: string[] | { key: string; needs: string }[];
    /** `in_use` on a role: how many accounts hold it. */
    memberCount?: number;
    /** `phone_in_use`: the account that already has the phone. */
    userId?: string;
    /** `stale_version` and `invalid_transition`: the record as it is now, so the client can refetch it. */
    current?: Record<string, unknown>;
  };
}

const DEFAULT_CODES: Record<number, string> = {
  400: "bad-request",
  401: "unauthenticated",
  403: "forbidden",
  404: "not-found",
  405: "method-not-allowed",
  409: "conflict",
  422: "validation-failed",
  429: "rate-limited",
  500: "internal-error",
};

const DEFAULT_MESSAGES: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  409: "Conflict",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  503: "Service Unavailable",
  500: "Internal Server Error",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFieldErrors(value: unknown): Record<string, string[]> | undefined {
  if (!isRecord(value)) return undefined;
  const result: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(value)) {
    if (Array.isArray(messages) && messages.every((m) => typeof m === "string")) {
      result[field] = messages as string[];
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function readStrings(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === "string") ? (value as string[]) : undefined;
}

function readPairs(value: unknown): { key: string; needs: string }[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const pairs = value.filter((entry): entry is { key: string; needs: string } => isRecord(entry) && typeof entry.key === "string" && typeof entry.needs === "string");
  return pairs.length === value.length ? pairs.map(({ key, needs }) => ({ key, needs })) : undefined;
}

function statusCodeOf(error: unknown): number {
  if (isRecord(error)) {
    const code = error.statusCode ?? error.status;
    if (typeof code === "number" && Number.isInteger(code) && code >= 400 && code <= 599) {
      return code;
    }
  }
  return 500;
}

export function toApiErrorBody(error: unknown): ApiErrorBody {
  const statusCode = statusCodeOf(error);
  const data = isRecord(error) && isRecord(error.data) ? error.data : {};
  const code =
    typeof data.code === "string" && data.code.length > 0
      ? data.code
      : (DEFAULT_CODES[statusCode] ?? (statusCode >= 500 ? "internal-error" : "request-failed"));
  // Client errors may explain themselves; a server error never leaks its message.
  const rawMessage = isRecord(error) ? error.statusMessage : undefined;
  const statusMessage =
    statusCode < 500 && typeof rawMessage === "string" && rawMessage.length > 0
      ? rawMessage
      : (DEFAULT_MESSAGES[statusCode] ?? (statusCode >= 500 ? "Internal Server Error" : "Error"));
  const fieldErrors = readFieldErrors(data.fieldErrors);
  const retryAfter =
    typeof data.retryAfter === "number" && Number.isInteger(data.retryAfter) && data.retryAfter > 0
      ? data.retryAfter
      : undefined;
  const missing = readStrings(data.missing) ?? readPairs(data.missing);
  const memberCount = statusCode < 500 && typeof data.memberCount === "number" && Number.isInteger(data.memberCount) && data.memberCount >= 0 ? data.memberCount : undefined;
  const userId = statusCode < 500 && typeof data.userId === "string" && /^[0-9a-f-]{36}$/i.test(data.userId) ? data.userId : undefined;
  // Only a client error explains itself with a document; a server error never does.
  const current = statusCode < 500 && isRecord(data.current) ? data.current : undefined;
  return {
    statusCode,
    statusMessage,
    data: {
      code,
      ...(retryAfter ? { retryAfter } : {}),
      ...(fieldErrors ? { fieldErrors } : {}),
      ...(missing ? { missing } : {}),
      ...(userId ? { userId } : {}),
      ...(memberCount !== undefined ? { memberCount } : {}),
      ...(current ? { current } : {}),
    },
  };
}

export function isApiV1Path(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0] ?? "";
  return pathname === "/api/v1" || pathname.startsWith("/api/v1/");
}

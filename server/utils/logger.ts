import type { H3Event } from "h3";

type Level = "debug" | "info" | "warn" | "error";

/** One structured JSON line on stdout; every line from a request carries its request id. */
export function writeLog(
  level: Level,
  message: string,
  fields: Record<string, unknown> = {},
  requestId?: string,
): void {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    message,
    ...(requestId ? { requestId } : {}),
    ...fields,
  });
  const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
}

export function requestLogger(event: H3Event) {
  const requestId = event.context.requestId as string | undefined;
  return {
    debug: (message: string, fields?: Record<string, unknown>) =>
      writeLog("debug", message, fields, requestId),
    info: (message: string, fields?: Record<string, unknown>) =>
      writeLog("info", message, fields, requestId),
    warn: (message: string, fields?: Record<string, unknown>) =>
      writeLog("warn", message, fields, requestId),
    error: (message: string, fields?: Record<string, unknown>) =>
      writeLog("error", message, fields, requestId),
  };
}

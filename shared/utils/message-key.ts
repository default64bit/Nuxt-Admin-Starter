/** A message-key segment for a server code or option value: message keys are lowerCamel (`too_large` → `tooLarge`, `last-30-days` → `last30Days`). */
export const messageKey = (code: unknown): string => String(code ?? "").replace(/[-_]([a-z0-9])/g, (_, c: string) => c.toUpperCase());

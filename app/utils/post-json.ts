/**
 * Transport for JSON POSTs inside Vue Query mutation functions. An untyped alias of `$fetch`:
 * Nitro's generated route typings are too deep to infer for every call site.
 */
export const postJson: <T>(url: string, body: unknown) => Promise<T> = (url, body) =>
  ($fetch as unknown as (url: string, options: Record<string, unknown>) => Promise<never>)(url, {
    method: "POST",
    body,
  });

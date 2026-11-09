import { createHash } from "node:crypto";

/**
 * Content-hash CSP (ADR-0022). The policy is derived from the rendered HTML itself, so it is the same
 * for every visitor and a shared-cached page replays a policy that still matches its body. No
 * per-request nonce exists anywhere.
 */

export interface InlineHashes {
  /** `'sha256-…'` of every executable inline `<script>`, `'shaNNN-…'` of every SRI-protected external script. */
  script: string[];
  /** `'sha256-…'` of every inline `<style>`. */
  style: string[];
}

export interface CspOptions {
  /** Origin of the media/CDN host (`public.mediaBaseUrl`), if configured. */
  mediaOrigin?: string;
  /** Error-tracking origin, only when a DSN is configured. */
  errorOrigin?: string;
  /** Error-tracking security endpoint, only when a DSN is configured. */
  reportUri?: string;
  /** Vite dev server: HMR websocket, runtime style injection, no `strict-dynamic`. */
  dev?: boolean;
  /** Add `upgrade-insecure-requests`; off for plain-http local previews. */
  upgradeInsecureRequests?: boolean;
}

const TAG = /<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
const LINK = /<link\b([^>]*)>/gi;
const NON_EXECUTABLE_SCRIPT_TYPES = /^(application\/(ld\+)?json|text\/(plain|template))$/i;

function attribute(attributes: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(attributes);
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined;
}

export function sha256Source(content: string): string {
  return `'sha256-${createHash("sha256").update(content, "utf8").digest("base64")}'`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/** Collect the hash sources a rendered HTML document needs. `__NUXT_DATA__` and JSON-LD are data blocks. */
export function extractInlineHashes(html: string): InlineHashes {
  const script: string[] = [];
  const style: string[] = [];
  for (const [, tag, attributes = "", content = ""] of html.matchAll(TAG)) {
    if (tag!.toLowerCase() === "style") {
      if (content.length > 0) style.push(sha256Source(content));
      continue;
    }
    const integrity = attribute(attributes, "integrity");
    if (attribute(attributes, "src") !== undefined) {
      if (integrity) script.push(...integrity.split(/\s+/).map((token) => `'${token}'`));
      continue;
    }
    const type = attribute(attributes, "type");
    if (type && NON_EXECUTABLE_SCRIPT_TYPES.test(type)) continue;
    if (content.length > 0) script.push(sha256Source(content));
  }
  for (const [, attributes = ""] of html.matchAll(LINK)) {
    const integrity = attribute(attributes, "integrity");
    if (integrity && /modulepreload/i.test(attribute(attributes, "rel") ?? "")) {
      script.push(...integrity.split(/\s+/).map((token) => `'${token}'`));
    }
  }
  return { script: unique(script), style: unique(style) };
}

function originOf(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const { origin } = new URL(value);
    return origin === "null" ? undefined : origin;
  } catch {
    return undefined;
  }
}

/** Origin and security-endpoint URL derived from a Sentry-compatible DSN, or undefined without one. */
export function reportingFromDsn(dsn: string | undefined): { origin: string; reportUri: string } | undefined {
  if (!dsn) return undefined;
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.split("/").filter(Boolean).pop();
    if (!url.username || !projectId) return undefined;
    return {
      origin: url.origin,
      reportUri: `${url.origin}/api/${projectId}/security/?glitchtip_key=${url.username}`,
    };
  } catch {
    return undefined;
  }
}

export function buildCsp(hashes: InlineHashes, options: CspOptions = {}): string {
  const media = originOf(options.mediaOrigin);
  const errorOrigin = originOf(options.errorOrigin);
  const dev = options.dev === true;

  const directives: Array<[string, string[]]> = [
    ["base-uri", ["'none'"]],
    ["font-src", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'self'"]],
    // `blob:` is for previews of files the user picked locally (the media field); only our own scripts
    // can mint blob URLs, so it opens no new origin.
    ["img-src", ["'self'", "data:", "blob:", ...(media ? [media] : [])]],
    ["media-src", ["'self'", ...(media ? [media] : [])]],
    ["object-src", ["'none'"]],
    // The admin PWA: its manifest and service worker are same-origin.
    ["manifest-src", ["'self'"]],
    ["worker-src", ["'self'"]],
    [
      "connect-src",
      ["'self'", ...(errorOrigin ? [errorOrigin] : []), ...(dev ? ["ws://localhost:*", "ws://127.0.0.1:*"] : [])],
    ],
    // `strict-dynamic` lets hashed scripts load their own chunks; it also makes browsers ignore
    // `'self'`, which Vite's unhashed dev scripts need, so dev drops it.
    ["script-src", ["'self'", ...(dev ? [] : ["'strict-dynamic'"]), ...hashes.script]],
    ["script-src-attr", ["'none'"]],
    ["style-src", ["'self'", ...hashes.style, ...(dev ? ["'unsafe-inline'"] : [])]],
    // Vue `:style` bindings and Reka positioning write style attributes; they cannot run script.
    ["style-src-attr", ["'unsafe-inline'"]],
  ];

  const parts = directives.map(([name, sources]) => `${name} ${sources.join(" ")}`);
  if (options.upgradeInsecureRequests !== false) parts.push("upgrade-insecure-requests");
  if (options.reportUri) parts.push(`report-uri ${options.reportUri}`);
  return parts.join("; ");
}

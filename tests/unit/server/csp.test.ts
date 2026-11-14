// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildCsp, extractInlineHashes, reportingFromDsn, sha256Source } from "../../../server/utils/csp";

const THEME = '"use strict";(()=>{document.documentElement.classList.add("dark")})()';
const CONFIG = 'window.__NUXT__={config:{public:{siteUrl:"https://app.example"}}}';
const STYLE = "html{color-scheme:light}";

const html = `<!DOCTYPE html><html><head>
<script type="importmap">{"imports":{"#entry":"/_nuxt/a.js"}}</script>
<style>${STYLE}</style>
<link rel="stylesheet" href="/_nuxt/e.css" integrity="sha384-CSS">
<link rel="modulepreload" as="script" href="/_nuxt/a.js" integrity="sha384-PRELOAD" crossorigin>
<script type="module" src="/_nuxt/a.js" integrity="sha384-ENTRY" crossorigin></script>
<script>${THEME}</script>
<script>${CONFIG}</script>
<script type="application/ld+json">{"@context":"https://schema.org"}</script>
<script type="application/json" id="__NUXT_DATA__">[{"a":1}]</script>
<script src="/_nuxt/no-integrity.js"></script>
</head><body></body></html>`;

describe("extractInlineHashes", () => {
  const hashes = extractInlineHashes(html);

  it("hashes every executable inline script, including the pre-paint theme script", () => {
    expect(hashes.script).toContain(sha256Source(THEME));
    expect(hashes.script).toContain(sha256Source(CONFIG));
    expect(hashes.script).toContain(sha256Source('{"imports":{"#entry":"/_nuxt/a.js"}}'));
  });

  it("uses the exact sha256 of the element text", () => {
    const expected = `'sha256-${createHash("sha256").update(THEME).digest("base64")}'`;
    expect(sha256Source(THEME)).toBe(expected);
  });

  it("allows external scripts and modulepreloads by their SRI integrity", () => {
    expect(hashes.script).toContain("'sha384-ENTRY'");
    expect(hashes.script).toContain("'sha384-PRELOAD'");
    expect(hashes.script).not.toContain("'sha384-CSS'");
  });

  it("ignores data blocks and unprotected external scripts", () => {
    expect(hashes.script).toHaveLength(5);
    expect(hashes.script.join(" ")).not.toContain("schema.org");
  });

  it("hashes inline styles", () => {
    expect(hashes.style).toEqual([sha256Source(STYLE)]);
  });
});

describe("buildCsp", () => {
  const hashes = extractInlineHashes(html);
  const csp = buildCsp(hashes);

  it("never contains a nonce or script unsafe-inline/eval", () => {
    expect(csp).not.toContain("nonce-");
    const script = /script-src ([^;]*)/.exec(csp)![1]!;
    expect(script).not.toContain("unsafe-inline");
    expect(script).not.toContain("unsafe-eval");
    expect(script).toContain("'strict-dynamic'");
    expect(csp).toContain("script-src-attr 'none'");
    expect(csp).toContain("worker-src 'self'");
    expect(csp).toContain("manifest-src 'self'");
    expect(csp).toContain("style-src-attr 'unsafe-inline'");
  });

  it("is deterministic, so a cached replay gets the same policy", () => {
    expect(buildCsp(extractInlineHashes(html))).toBe(csp);
  });

  it("adds the media origin to img-src and media-src only when configured", () => {
    expect(csp).toContain("img-src 'self' data: blob:;");
    const withMedia = buildCsp(hashes, { mediaOrigin: "https://media.app.example/bucket/" });
    expect(withMedia).toContain("img-src 'self' data: blob: https://media.app.example;");
    expect(withMedia).toContain("media-src 'self' https://media.app.example;");
  });

  it("only mentions reporting when an error-tracking endpoint is configured", () => {
    expect(csp).not.toContain("report-uri");
    expect(csp).toContain("connect-src 'self';");
    const reporting = reportingFromDsn("https://abc123@errors.app.example/7");
    const withDsn = buildCsp(hashes, { errorOrigin: reporting?.origin, reportUri: reporting?.reportUri });
    expect(withDsn).toContain("report-uri https://errors.app.example/api/7/security/?glitchtip_key=abc123");
    expect(withDsn).toContain("connect-src 'self' https://errors.app.example;");
  });

  it("treats a missing or malformed DSN as no reporting, never an error", () => {
    expect(reportingFromDsn(undefined)).toBeUndefined();
    expect(reportingFromDsn("")).toBeUndefined();
    expect(reportingFromDsn("not a dsn")).toBeUndefined();
    expect(reportingFromDsn("https://errors.app.example/7")).toBeUndefined();
  });

  it("adjusts for the Vite dev server only in dev", () => {
    const dev = buildCsp(hashes, { dev: true });
    expect(dev).toContain("ws://localhost:*");
    expect(dev).not.toContain("'strict-dynamic'");
    expect(csp).not.toContain("ws://");
  });

  it("can omit upgrade-insecure-requests for plain-http previews", () => {
    expect(csp).toContain("upgrade-insecure-requests");
    expect(buildCsp(hashes, { upgradeInsecureRequests: false })).not.toContain("upgrade-insecure-requests");
  });
});

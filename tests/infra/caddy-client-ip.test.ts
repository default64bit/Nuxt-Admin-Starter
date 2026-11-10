// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Client IP and the www redirect at the edge. No proxy is trusted: the app sees the TCP peer as the visitor address.
// The static assertions cover the Caddyfile and every Optional-piece site file. The runtime tests run the repository
// Caddyfile (ACME replaced by plain HTTP, the app by an echo server) in the pinned Caddy image. Peers come from two
// Docker networks: one whose subnet lies inside a public CDN range (once trusted by an earlier design, now an ordinary
// client) and one private network. Runs in `deploy-automation` only (`just test-compose` sets INFRA_TESTS=1).
const infra = process.env.INFRA_TESTS === "1";
const hasDocker = infra && spawnSync("docker", ["version"]).status === 0;
const caddyfile = readFileSync("Caddyfile", "utf8");
const pieceFiles = readdirSync("ops/caddy/pieces").map((name) => readFileSync(join("ops/caddy/pieces", name), "utf8"));
const image = readFileSync("ops/caddy/base-images.txt", "utf8")
  .split("\n")
  .find((line) => /^caddy:\S+@sha256:[0-9a-f]{64}$/.test(line.trim()))!
  .trim();
const strip = (text: string) => text.replace(/^\s*#.*\n/gm, "");

describe.skipIf(!infra)("Caddyfile client IP and www", () => {
  it("trusts no proxy: no trusted ranges and no client IP header", () => {
    expect([caddyfile, ...pieceFiles].map(strip).join("\n")).not.toMatch(/trusted_proxies|client_ip_headers|servers \{/);
  });

  it("replaces X-Forwarded-For with the verified client address on every reverse_proxy", () => {
    const all = [caddyfile, ...pieceFiles].map(strip).join("\n");
    const proxies = all.match(/reverse_proxy [^\n]*\{\n\s*header_up X-Forwarded-For \{client_ip\}\n\s*\}/g) ?? [];
    expect(proxies.length).toBeGreaterThan(0);
    expect(proxies).toHaveLength(all.match(/^\s*reverse_proxy /gm)?.length ?? 0);
  });

  it("serves www with its own certificate and a permanent redirect keeping path and query", () => {
    expect(caddyfile).toMatch(/www\.\{\$SITE_DOMAIN\} \{\n\tredir https:\/\/\{\$SITE_DOMAIN\}\{uri\} 308\n\}/);
  });
});

const suffix = `${process.pid}`;
const names = { cdn: `nas46-cdn-${suffix}`, open: `nas46-open-${suffix}`, backend: `nas46-backend-${suffix}`, echo: `nas46-echo-${suffix}`, edge: `nas46-edge-${suffix}`, peer: `nas46-peer-${suffix}` };
// 185.143.232.0/22 is a public CDN range; 172.29.231.0/24 is private and in no CDN range.
const cdnGateway = "185.143.232.1";
const openGateway = "172.29.231.1";
const ips = { cdn: "185.143.232.10", open: "172.29.231.10", cdnPeer: "185.143.232.20" };

function docker(...args: string[]) {
  const result = spawnSync("docker", args, { encoding: "utf8", timeout: 180_000 });
  expect(result.status, `docker ${args.join(" ")}\n${result.stderr}`).toBe(0);
  return result.stdout.trim();
}

function get(ip: string, host: string, path: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; body: string; location?: string }>((resolvePromise, reject) => {
    // localAddress is left unset: the kernel picks the bridge address of the network the container IP is on.
    const req = request({ host: ip, port: 80, path, headers: { host, ...headers } }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolvePromise({ status: res.statusCode ?? 0, body, location: res.headers.location }));
    });
    req.on("error", reject);
    req.setTimeout(10_000, () => req.destroy(new Error("timeout")));
    req.end();
  });
}

// A request from a container inside the CDN-range network: container-to-container traffic is routed reliably, the
// host's own traffic to a public-looking address is not. The peer address seen by Caddy is ips.cdnPeer.
function getAsCdnPeer(host: string, path: string, headers: Record<string, string> = {}) {
  const header = Object.entries({ host, ...headers }).flatMap(([name, value]) => ["--header", `${name}: ${value}`]);
  const result = spawnSync("docker", ["exec", names.peer, "wget", "-qO-", "-T", "10", ...header, `http://${ips.cdn}${path}`], { encoding: "utf8", timeout: 30_000 });
  expect(result.status, result.stderr).toBe(0);
  return { body: result.stdout.trim() };
}

function cleanup() {
  for (const name of [names.edge, names.echo, names.peer]) spawnSync("docker", ["rm", "-f", name]);
  for (const name of [names.cdn, names.open, names.backend]) spawnSync("docker", ["network", "rm", name]);
}

describe.skipIf(!hasDocker)("edge client IP and www redirect (Caddy in front of an echo upstream)", () => {
  beforeAll(async () => {
    cleanup();
    const dir = mkdtempSync(join(tmpdir(), "caddy-client-ip-"));
    // The repository Caddyfile with plain HTTP and no ACME: every site is an http:// address and auto HTTPS is off.
    // Everything else (reverse_proxy headers, redir) is untouched.
    const edge = caddyfile
      .replace("\tacme_ca {$CADDY_ACME_CA}\n", "")
      .replace("\temail {$ACME_EMAIL}\n", "\tauto_https off\n")
      .replace(/^((?:www\.)?\{\$SITE_DOMAIN\} \{)$/gm, "http://$1");
    expect(edge).toContain("http://www.{$SITE_DOMAIN} {");
    writeFileSync(join(dir, "Caddyfile"), edge);
    writeFileSync(join(dir, "echo.Caddyfile"), `{\n\tauto_https off\n}\n:3000 {\n\trespond "{http.request.header.X-Forwarded-For}"\n}\n`);

    docker("network", "create", "--internal", names.backend);
    docker("network", "create", "--subnet", "185.143.232.0/24", "--gateway", cdnGateway, names.cdn);
    docker("network", "create", "--subnet", "172.29.231.0/24", "--gateway", openGateway, names.open);
    docker("create", "--name", names.echo, "--network", names.backend, "--network-alias", "app", "-v", `${join(dir, "echo.Caddyfile")}:/etc/caddy/Caddyfile:ro`, image, "caddy", "run", "--config", "/etc/caddy/Caddyfile");
    docker("start", names.echo);
    docker("create", "--name", names.edge, "--network", names.backend, "-e", "SITE_DOMAIN=app.test", "-v", `${join(dir, "Caddyfile")}:/etc/caddy/Caddyfile:ro`, "-v", `${resolve("ops/caddy/pieces")}:/etc/caddy/pieces:ro`, image, "caddy", "run", "--config", "/etc/caddy/Caddyfile");
    docker("network", "connect", "--ip", ips.cdn, names.cdn, names.edge);
    docker("network", "connect", "--ip", ips.open, names.open, names.edge);
    docker("start", names.edge);
    docker("run", "-d", "--name", names.peer, "--network", names.cdn, "--ip", ips.cdnPeer, image, "sleep", "600");
    for (let attempt = 0; attempt < 50; attempt++) {
      const ready = await get(ips.open, "app.test", "/").then((r) => r.status === 200, () => false);
      if (ready) return;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`edge Caddy did not become ready:\n${docker("logs", names.edge)}`);
  }, 180_000);

  afterAll(cleanup);

  it("gives the app the real peer address when a direct request forges X-Forwarded-For, even one claiming a proxy chain", async () => {
    for (const forged of ["6.6.6.6", "185.143.232.5, 203.0.113.9"]) {
      expect(await get(ips.open, "app.test", "/", { "x-forwarded-for": forged })).toMatchObject({ status: 200, body: openGateway });
    }
  });

  it("gives the app the peer itself when a peer inside a CDN range forwards a client address", () => {
    expect(getAsCdnPeer("app.test", "/", { "x-forwarded-for": "6.6.6.6, 203.0.113.9" }).body).toBe(ips.cdnPeer);
    expect(getAsCdnPeer("app.test", "/").body).toBe(ips.cdnPeer);
  });

  it("redirects www to the apex with 308, keeping path and query", async () => {
    const res = await get(ips.open, "www.app.test", "/en/admin/users?sort=new&page=2");
    expect(res.status).toBe(308);
    expect(res.location).toBe("https://app.test/en/admin/users?sort=new&page=2");
  });
});

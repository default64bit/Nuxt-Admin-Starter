import { createServer } from "node:http";
import { readFileSync } from "node:fs";

// Answers like the app for the smoke check: liveness, readiness, the landing page and the sign-in page.
const behavior = readFileSync("/etc/stub-behavior", "utf8").trim();
createServer((req, res) => {
  if (req.url === "/api/health/ready" && behavior === "unready") {
    res.writeHead(503).end("not ready");
    return;
  }
  const body = { "/api/health/ready": '{"status":"ready"}', "/sign-in": "<form></form>", "/": "<h1>Stub</h1>" }[req.url ?? ""] ?? "ok";
  res.writeHead(200, { "content-type": "text/plain" }).end(body);
}).listen(3000, "0.0.0.0");

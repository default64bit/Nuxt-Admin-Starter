import { createDecipheriv, createECDH, createHmac, randomBytes } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";

// A local fake Web Push service (.specs/notifications/spec.md "Testing push without a real push service"). It is a
// real HTTP server that plays the push service AND the browser: each test subscription owns a P-256 key pair and an
// auth secret, so the fake decrypts the `aes128gcm` payload (RFC 8188/8291) to assert content, and answers error codes
// on demand. CI never contacts a real push service.

export interface FakeSubscription {
  /** Where the app sends the push; a capability URL on the fake. */
  endpoint: string;
  /** The browser's public key and auth secret, base64url, as `PushSubscription.toJSON()` would give them. */
  p256dh: string;
  auth: string;
}

export interface FakePushRequest {
  path: string;
  headers: http.IncomingHttpHeaders;
  /** The decrypted JSON payload, or null for an empty push (the health probe) or one that could not be decrypted. */
  payload: Record<string, unknown> | null;
  decrypted: boolean;
}

export interface Scripted {
  status: number;
  headers?: Record<string, string>;
  /** How many requests to answer this way; default 1. */
  times?: number;
}

export interface FakePush {
  /** Origin of the fake, e.g. `http://127.0.0.1:41234`. */
  url: string;
  requests: FakeRequestList;
  /** A new test subscription whose endpoint points at the fake. */
  subscribe(): FakeSubscription;
  /** Answers the next request(s) to this endpoint with a status; with no endpoint, the next request(s) to any. */
  script(answer: Scripted, endpoint?: string): void;
  /** Answers `400` to every request that carries a `Topic` header (a push service that refuses it). */
  rejectTopic(on?: boolean): void;
  clear(): void;
  close(): Promise<void>;
}

type FakeRequestList = FakePushRequest[];

const hmac = (key: Buffer, data: Buffer) => createHmac("sha256", key).update(data).digest();

/** RFC 8291 section 3: decrypts one `aes128gcm` web push message for the subscription that owns `ua`. */
export function decryptWebPush(body: Buffer, ua: ReturnType<typeof createECDH>, authSecret: Buffer): Buffer {
  const salt = body.subarray(0, 16);
  const idLength = body[20]!;
  const asPublic = body.subarray(21, 21 + idLength);
  const record = body.subarray(21 + idLength);
  const secret = ua.computeSecret(asPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), ua.getPublicKey(), asPublic]);
  const ikm = hmac(hmac(authSecret, secret), Buffer.concat([keyInfo, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(record.subarray(record.length - 16));
  const padded = Buffer.concat([decipher.update(record.subarray(0, record.length - 16)), decipher.final()]);
  let end = padded.length;
  while (end > 0 && padded[end - 1] === 0) end -= 1;
  if (padded[end - 1] !== 2) throw new Error("bad padding delimiter");
  return padded.subarray(0, end - 1);
}


export async function startFakePush(): Promise<FakePush> {
  const requests: FakePushRequest[] = [];
  const keys = new Map<string, { ua: ReturnType<typeof createECDH>; auth: Buffer }>();
  const scripts: { endpoint?: string; answer: Scripted; left: number }[] = [];
  let refuseTopic = false;

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const path = req.url ?? "";
      const body = Buffer.concat(chunks);
      let payload: Record<string, unknown> | null = null;
      let decrypted = false;
      const owner = keys.get(path);
      if (body.length > 0 && owner) {
        try {
          payload = JSON.parse(decryptWebPush(body, owner.ua, owner.auth).toString("utf8")) as Record<string, unknown>;
          decrypted = true;
        } catch {
          payload = null;
        }
      }
      requests.push({ path, headers: req.headers, payload, decrypted });

      const scripted = scripts.find((entry) => entry.left > 0 && (entry.endpoint === undefined || entry.endpoint === path));
      let status = 201;
      let headers: Record<string, string> = {};
      if (scripted) {
        scripted.left -= 1;
        status = scripted.answer.status;
        headers = scripted.answer.headers ?? {};
      } else if (refuseTopic && req.headers.topic) status = 400;
      else if (!owner) status = 404; // an unknown subscription, like a made-up FCM token
      res.writeHead(status, headers);
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    url,
    requests,
    subscribe() {
      const ua = createECDH("prime256v1");
      ua.generateKeys();
      const auth = randomBytes(16);
      const path = `/push/${randomBytes(12).toString("hex")}`;
      keys.set(path, { ua, auth });
      return { endpoint: `${url}${path}`, p256dh: ua.getPublicKey().toString("base64url"), auth: auth.toString("base64url") };
    },
    script(answer, endpoint) {
      scripts.push({ endpoint: endpoint ? new URL(endpoint).pathname : undefined, answer, left: answer.times ?? 1 });
    },
    rejectTopic(on = true) {
      refuseTopic = on;
    },
    clear() {
      requests.length = 0;
      scripts.length = 0;
      refuseTopic = false;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

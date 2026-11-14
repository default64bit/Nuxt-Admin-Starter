import { createECDH } from "node:crypto";

// The Web Push Channel's deployment configuration (ADR-0028). Missing or invalid values make the channel not configured and are reported as a config
// error naming the key, never the value (the private key is a secret). Nothing here throws, and nothing here may block
// startup, readiness or a deploy. No proxy setting exists.

export type PushEnv = Record<string, string | undefined>;

export interface PushConfig {
  /** `operational` only with a valid VAPID key pair and subject, and no kill switch. */
  state: "operational" | "not_configured" | "disabled";
  publicKey: string;
  /** Secret: handed to the signing library only. Never logged, audited, stored in an outbox row or sent to the browser. */
  privateKey: string;
  subject: string;
  /** Each entry names a key and what is wrong; never a value. Empty when the setup is clean (or simply absent). */
  errors: string[];
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

function decode(value: string): Buffer | null {
  return BASE64URL.test(value) ? Buffer.from(value, "base64url") : null;
}

/** A P-256 public key in uncompressed form: 65 bytes starting 0x04, URL-safe base64 without padding. */
const isPublicKey = (value: string) => {
  const bytes = decode(value);
  return bytes !== null && bytes.length === 65 && bytes[0] === 0x04;
};
const isPrivateKey = (value: string) => decode(value)?.length === 32;

/** The private key must belong to the public key, or every signed request is rejected. */
function isPair(publicKey: string, privateKey: string): boolean {
  try {
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(Buffer.from(privateKey, "base64url"));
    return ecdh.getPublicKey().equals(Buffer.from(publicKey, "base64url"));
  } catch {
    return false;
  }
}

/** VAPID `sub` is a `mailto:` address or an `https:` URL (RFC 8292). */
export function isVapidSubject(value: string): boolean {
  if (/^mailto:[^\s@]+@[^\s@]+$/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length > 0;
  } catch {
    return false;
  }
}

export function resolvePushConfig(env: PushEnv = process.env): PushConfig {
  const publicKey = (env.NUXT_VAPID_PUBLIC_KEY ?? "").trim();
  const privateKey = (env.NUXT_VAPID_PRIVATE_KEY ?? "").trim();
  const subject = (env.NUXT_VAPID_SUBJECT ?? "").trim();
  const errors: string[] = [];
  const anySet = Boolean(publicKey || privateKey || subject);

  if (anySet) {
    if (!publicKey) errors.push("NUXT_VAPID_PUBLIC_KEY is required when other VAPID settings are set");
    else if (!isPublicKey(publicKey)) errors.push("NUXT_VAPID_PUBLIC_KEY is not a valid VAPID public key");
    if (!privateKey) errors.push("NUXT_VAPID_PRIVATE_KEY is required when other VAPID settings are set");
    else if (!isPrivateKey(privateKey)) errors.push("NUXT_VAPID_PRIVATE_KEY is not a valid VAPID private key");
    if (!subject) errors.push("NUXT_VAPID_SUBJECT is required when other VAPID settings are set");
    else if (!isVapidSubject(subject)) errors.push("NUXT_VAPID_SUBJECT must be a mailto: address or an https: URL");
  }

  if (errors.length === 0 && anySet && !isPair(publicKey, privateKey)) errors.push("NUXT_VAPID_PRIVATE_KEY does not belong to NUXT_VAPID_PUBLIC_KEY");

  const killed = env.NUXT_ADMIN_CHANNEL_PUSH_ENABLED?.trim().toLowerCase() === "false";
  const state = killed ? "disabled" : anySet && errors.length === 0 ? "operational" : "not_configured";
  return { state, publicKey, privateKey, subject, errors };
}

/** The key a browser subscribes with, only while push is operational by configuration; null otherwise. Never the private key. */
export function pushPublicKeyOf(env: PushEnv = process.env): string | null {
  const config = resolvePushConfig(env);
  return config.state === "operational" ? config.publicKey : null;
}

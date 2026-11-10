import { createHmac } from "node:crypto";

/** Only an HMAC of the caller's IP is ever stored (`otp_send_events.ip_hash`). */
export function hashIp(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(ip).digest("hex");
}

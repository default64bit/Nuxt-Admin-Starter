import { tooLarge } from "./domain-errors";

/**
 * Reads a request body into memory with a hard size cap (.specs/media/spec.md): a declared length over
 * the limit is refused before any byte is read, and a body that outgrows the limit while streaming
 * (no length declared, or a header that lied) stops at once with `too_large`.
 */
export async function readLimited(stream: AsyncIterable<Buffer | Uint8Array>, max: number, declaredLength?: number): Promise<Buffer> {
  if (declaredLength !== undefined && Number.isFinite(declaredLength) && declaredLength > max) throw tooLarge();
  const parts: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.byteLength;
    if (size > max) throw tooLarge();
    parts.push(Buffer.from(chunk));
  }
  return Buffer.concat(parts);
}

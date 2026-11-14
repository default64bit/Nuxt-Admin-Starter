import { isStorageConfigured } from "./runtime-config-schema";
import { mediaNotConfigured } from "./domain-errors";
import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type StorageBucket = "private" | "public";

/**
 * The few object-store operations the media pipeline needs, behind one seam so services are
 * tested with an in-memory store and run against RustFS (S3-compatible) in the app.
 */
export interface ObjectStorage {
  put(bucket: StorageBucket, key: string, body: Buffer, contentType: string): Promise<void>;
  get(bucket: StorageBucket, key: string): Promise<Buffer>;
  copy(from: { bucket: StorageBucket; key: string }, to: { bucket: StorageBucket; key: string }): Promise<void>;
  remove(bucket: StorageBucket, key: string): Promise<void>;
}

export interface S3StorageConfig {
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  privateBucket: string;
  publicBucket: string;
}

export function createS3Storage(config: S3StorageConfig): ObjectStorage {
  // Path-style addressing: RustFS is reached by service name, not a bucket subdomain.
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
  });
  const bucketName = (bucket: StorageBucket) => (bucket === "private" ? config.privateBucket : config.publicBucket);
  return {
    async put(bucket, key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: bucketName(bucket), Key: key, Body: body, ContentType: contentType }));
    },
    async get(bucket, key) {
      const result = await client.send(new GetObjectCommand({ Bucket: bucketName(bucket), Key: key }));
      return Buffer.from(await result.Body!.transformToByteArray());
    },
    async copy(from, to) {
      await client.send(
        new CopyObjectCommand({ Bucket: bucketName(to.bucket), Key: to.key, CopySource: `${bucketName(from.bucket)}/${encodeURIComponent(from.key).replaceAll("%2F", "/")}` }),
      );
    },
    async remove(bucket, key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucketName(bucket), Key: key }));
    },
  };
}

/** `NUXT_S3_ENDPOINT=memory:` selects the in-process store below: for tests and local runs without RustFS, refused in production. */
export const MEMORY_STORAGE_ENDPOINT = "memory:";

/** An in-memory object store: a map of `bucket/key` to bytes. The fake adapter of the storage seam (tests, local runs). */
export class MemoryStorage implements ObjectStorage {
  readonly objects = new Map<string, { body: Buffer; contentType?: string }>();
  failNextPut = false;
  private id = (bucket: StorageBucket, key: string) => `${bucket}/${key}`;

  async put(bucket: StorageBucket, key: string, body: Buffer, contentType: string) {
    if (this.failNextPut) {
      this.failNextPut = false;
      throw new Error("storage unavailable");
    }
    this.objects.set(this.id(bucket, key), { body, contentType });
  }
  async get(bucket: StorageBucket, key: string) {
    const object = this.objects.get(this.id(bucket, key));
    if (!object) throw new Error("NoSuchKey");
    return object.body;
  }
  async copy(from: { bucket: StorageBucket; key: string }, to: { bucket: StorageBucket; key: string }) {
    const object = this.objects.get(this.id(from.bucket, from.key));
    if (!object) throw new Error("NoSuchKey");
    this.objects.set(this.id(to.bucket, to.key), object);
  }
  async remove(bucket: StorageBucket, key: string) {
    this.objects.delete(this.id(bucket, key));
  }
  has(bucket: StorageBucket, key: string) {
    return this.objects.has(this.id(bucket, key));
  }
  keys(bucket: StorageBucket) {
    return [...this.objects.keys()].filter((id) => id.startsWith(`${bucket}/`)).map((id) => id.slice(bucket.length + 1));
  }
}

export const isMemoryStorage = (s3: { endpoint?: string } | undefined) => s3?.endpoint === MEMORY_STORAGE_ENDPOINT;

let storage: ObjectStorage | undefined;

/** The app's object store, or undefined while media storage is Off (not configured). Built once from the runtime S3 settings (a least-privilege identity, never the RustFS root keys). */
export function tryObjectStorage(): ObjectStorage | undefined {
  if (storage) return storage;
  const { s3, appEnv } = useRuntimeConfig();
  if (!isStorageConfigured(s3)) return undefined;
  storage = isMemoryStorage(s3) && appEnv !== "production" ? new MemoryStorage() : createS3Storage(s3 as S3StorageConfig);
  return storage;
}

/** The app's object store; `503 media_not_configured` while media storage is Off. */
export function useObjectStorage(): ObjectStorage {
  const found = tryObjectStorage();
  if (!found) throw mediaNotConfigured();
  return found;
}

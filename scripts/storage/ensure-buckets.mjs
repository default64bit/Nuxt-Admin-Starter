import {
  CreateBucketCommand,
  ListBucketsCommand,
  PutBucketPolicyCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const endpoint = process.env.RUSTFS_ENDPOINT || process.env.NUXT_S3_ENDPOINT;
const accessKeyId = process.env.RUSTFS_ACCESS_KEY;
const secretAccessKey = process.env.RUSTFS_SECRET_KEY;
const region = process.env.NUXT_S3_REGION || "us-east-1";
const privateBucket = process.env.NUXT_S3_PRIVATE_BUCKET;
const publicBucket = process.env.NUXT_S3_PUBLIC_BUCKET;

for (const [key, value] of Object.entries({ endpoint, accessKeyId, secretAccessKey, privateBucket, publicBucket })) {
  if (!value) {
    console.error(`${key} is required to ensure RustFS buckets.`);
    process.exit(1);
  }
}
if (privateBucket === publicBucket) {
  throw new Error("Private and public RustFS buckets must have different names.");
}

const client = new S3Client({
  endpoint,
  region,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});

async function listBucketsWhenReady(maxAttempts = 30) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await client.send(new ListBucketsCommand({}));
    } catch (error) {
      // Retry only startup/transient network/server failures. Permission and auth errors fail immediately.
      const transient = !error?.$metadata?.httpStatusCode
        || error.$metadata.httpStatusCode >= 500
        || ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EHOSTUNREACH"].includes(error?.cause?.code);
      if (!transient || attempt === maxAttempts) throw error;
      lastError = error;
      const delayMs = Math.min(500 * attempt, 3_000);
      console.log(`RustFS is not ready yet (attempt ${attempt}/${maxAttempts}); retrying in ${delayMs}ms.`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError ?? new Error("RustFS did not become ready.");
}

try {
  const response = await listBucketsWhenReady();
  const existing = new Set((response.Buckets || []).map((bucket) => bucket.Name));
  for (const name of [privateBucket, publicBucket]) {
    if (existing.has(name)) {
      console.log(`Bucket ${name} already exists; no creation needed.`);
      continue;
    }
    try {
      await client.send(new CreateBucketCommand({ Bucket: name }));
      console.log(`Created bucket ${name}.`);
    } catch (error) {
      // Treat a concurrent creation as success, but do not hide permission/configuration errors.
      if (!["BucketAlreadyExists", "BucketAlreadyOwnedByYou", "BucketAlreadyOwnedByYouException"].includes(error?.name)) {
        throw error;
      }
      console.log(`Bucket ${name} was created concurrently; treating as complete.`);
    }
  }

  // Public policy applies only to the public-media bucket. Private staging objects remain private.
  const policy = {
    Version: "2012-10-17",
    Statement: [{
      Sid: "PublicReadPublishedMediaOnly",
      Effect: "Allow",
      Principal: "*",
      Action: ["s3:GetObject"],
      Resource: [`arn:aws:s3:::${publicBucket}/*`],
    }],
  };
  await client.send(new PutBucketPolicyCommand({ Bucket: publicBucket, Policy: JSON.stringify(policy) }));
  console.log(`Ensured anonymous read-only object policy for ${publicBucket}; ${privateBucket} remains private.`);
} catch (error) {
  console.error("Could not ensure RustFS buckets/policies. Verify S3 compatibility and bootstrap credentials.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  client.destroy();
}

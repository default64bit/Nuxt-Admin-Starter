import { createHash, createHmac } from "node:crypto";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

// Creates (or updates) the least-privilege S3 identity the app and worker use, with a policy scoped to the
// two media buckets only. Runs in the one-off storage-init job: the RustFS root credentials are used here
// and nowhere in the app. Safe to rerun; a changed NUXT_S3_SECRET_KEY rotates the secret.

const endpoint = (process.env.RUSTFS_ENDPOINT || process.env.NUXT_S3_ENDPOINT || "").replace(/\/+$/, "");
const rootAccessKey = process.env.RUSTFS_ACCESS_KEY;
const rootSecretKey = process.env.RUSTFS_SECRET_KEY;
const appAccessKey = process.env.NUXT_S3_ACCESS_KEY;
const appSecretKey = process.env.NUXT_S3_SECRET_KEY;
const region = process.env.NUXT_S3_REGION || "us-east-1";
const privateBucket = process.env.NUXT_S3_PRIVATE_BUCKET;
const publicBucket = process.env.NUXT_S3_PUBLIC_BUCKET;
const POLICY_NAME = "app-media";
const ADMIN = "/rustfs/admin/v3";

function fail(message) {
  console.error(message);
  process.exit(1);
}

for (const [key, value] of Object.entries({ endpoint, rootAccessKey, rootSecretKey, appAccessKey, appSecretKey, privateBucket, publicBucket })) {
  if (!value) fail(`${key} is required to provision the RustFS application identity.`);
}
if (appAccessKey === rootAccessKey) fail("NUXT_S3_ACCESS_KEY must differ from the RustFS root access key; the app must not use root credentials.");
if (appSecretKey === rootSecretKey) fail("NUXT_S3_SECRET_KEY must differ from the RustFS root secret key.");
if (appAccessKey.length < 3 || appSecretKey.length < 8) fail("NUXT_S3_ACCESS_KEY needs at least 3 characters and NUXT_S3_SECRET_KEY at least 8.");

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();

/** A SigV4-signed call to the RustFS admin API with the root credentials. */
async function admin(method, path, query = {}, body = "") {
  const url = new URL(endpoint);
  const stamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = stamp.slice(0, 8);
  const payloadHash = sha256(body);
  const headers = { host: url.host, "x-amz-content-sha256": payloadHash, "x-amz-date": stamp };
  const names = Object.keys(headers).sort();
  const queryString = Object.entries(query)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  const canonical = [method, path, queryString, names.map((name) => `${name}:${headers[name]}\n`).join(""), names.join(";"), payloadHash].join("\n");
  const scope = `${date}/${region}/s3/aws4_request`;
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${rootSecretKey}`, date), region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(["AWS4-HMAC-SHA256", stamp, scope, sha256(canonical)].join("\n")).digest("hex");
  const response = await fetch(`${endpoint}${path}${queryString ? `?${queryString}` : ""}`, {
    method,
    headers: { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${rootAccessKey}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}` },
    body: body || undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`RustFS admin ${method} ${path.slice(ADMIN.length)} failed (${response.status}): ${text.replace(/\s+/g, " ").slice(0, 200)}`);
  return text;
}

// Only these two buckets, only object read/write/delete and listing: no bucket create/delete, no policy or admin actions.
const buckets = [privateBucket, publicBucket];
const policy = {
  Version: "2012-10-17",
  Statement: [
    { Sid: "ListMediaBuckets", Effect: "Allow", Action: ["s3:ListBucket", "s3:GetBucketLocation"], Resource: buckets.map((name) => `arn:aws:s3:::${name}`) },
    {
      Sid: "ManageMediaObjects",
      Effect: "Allow",
      Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts"],
      Resource: buckets.map((name) => `arn:aws:s3:::${name}/*`),
    },
  ],
};

try {
  // A key made in the RustFS console is a service account that inherits the root user's permissions, so it can
  // neither be reused nor made least-privilege here. Say so before changing anything.
  const { accounts = [] } = JSON.parse((await admin("GET", `${ADMIN}/list-service-accounts`)) || "{}");
  if (accounts.some((account) => account.accessKey === appAccessKey)) {
    throw new Error(
      `NUXT_S3_ACCESS_KEY (${appAccessKey}) is a RustFS service account (for example one created in the console), which inherits root permissions. ` +
        "Delete it in RustFS and set a new NUXT_S3_ACCESS_KEY/NUXT_S3_SECRET_KEY pair in .env; this job creates the restricted user itself.",
    );
  }
  await admin("PUT", `${ADMIN}/add-canned-policy`, { name: POLICY_NAME }, JSON.stringify(policy));
  await admin("PUT", `${ADMIN}/add-user`, { accessKey: appAccessKey }, JSON.stringify({ secretKey: appSecretKey, status: "enabled" }));
  await admin("PUT", `${ADMIN}/set-user-or-group-policy`, { policyName: POLICY_NAME, userOrGroup: appAccessKey, isGroup: "false" });
  console.log(`Ensured application S3 identity ${appAccessKey} with policy ${POLICY_NAME} limited to ${buckets.join(" and ")}.`);

  // Prove it with the app's own credentials, the way the readiness probe does.
  const client = new S3Client({ endpoint, region, forcePathStyle: true, credentials: { accessKeyId: appAccessKey, secretAccessKey: appSecretKey } });
  try {
    for (const name of buckets) await client.send(new HeadBucketCommand({ Bucket: name }));
    console.log("Verified the application identity can reach both buckets.");
  } finally {
    client.destroy();
  }
} catch (error) {
  console.error("Could not provision the RustFS application identity. Verify the root credentials and that the RustFS admin API is reachable.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

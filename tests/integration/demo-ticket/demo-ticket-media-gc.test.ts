// demo-ticket:start (whole file)
// @vitest-environment node
import { beforeEach, expect, it } from "vitest";
import { collectGarbage } from "../../../server/services/media-gc.service";
import { dbSuite, useTestDatabase } from "../support/database";
import { MemoryStorage } from "../support/memory-storage";

// Media GC against a real database and the in-memory store (.specs/media/spec.md): unattached uploads and detached
// images older than the grace period go, younger ones stay, and an object a ticket references is never touched.
dbSuite("media garbage collection", () => {
  const database = useTestDatabase();
  let storage: MemoryStorage;
  let n = 0;
  const q = async (sql: string, params: unknown[] = []) => (await database.pool.query(sql, params)).rows;

  async function media(bucket: "private" | "public", hours: number) {
    n += 1;
    const key = `${bucket === "private" ? "staging" : "images"}/gc-${n}.webp`;
    const [row] = await q(
      "INSERT INTO media_objects (bucket, object_key, mime_type, byte_size, width, height, created_at) VALUES ($1,$2,'image/webp',100,10,10, now() - ($3 || ' hours')::interval) RETURNING id",
      [bucket, key, String(hours)],
    );
    await storage.put(bucket, key, Buffer.from("bytes"), "image/webp");
    return { id: row.id as string, key };
  }

  beforeEach(async () => {
    storage = new MemoryStorage();
    await database.truncate();
  });

  it("deletes old unattached uploads and detached images, keeps young ones, and a dry run only reports", async () => {
    const oldStaged = await media("private", 25);
    const oldPublic = await media("public", 30);
    const fresh = await media("private", 23);
    expect(await collectGarbage({ db: database.db, storage }, { dryRun: true })).toMatchObject({ candidates: 2, deleted: 0 });
    expect(await collectGarbage({ db: database.db, storage })).toMatchObject({ deleted: 2, storageFailures: 0 });
    expect(storage.has("private", oldStaged.key) || storage.has("public", oldPublic.key)).toBe(false);
    expect(storage.has("private", fresh.key)).toBe(true);
    expect(await q("SELECT id FROM media_objects")).toEqual([{ id: fresh.id }]);
  });

  it("never deletes an object a ticket still references, however old", async () => {
    const [user] = await q("INSERT INTO users (phone_e164, phone_verified_at) VALUES ('+989120000301', now()) RETURNING id");
    const attached = await media("public", 24 * 400);
    await q("INSERT INTO demo_tickets (title, created_by, image_media_object_id, image_alt_fa, image_alt_en) VALUES ('T', $1, $2, 'a', 'a')", [user.id, attached.id]);
    expect(await collectGarbage({ db: database.db, storage })).toMatchObject({ deleted: 0 });
    expect(storage.has("public", attached.key)).toBe(true);
  });
});
// demo-ticket:end

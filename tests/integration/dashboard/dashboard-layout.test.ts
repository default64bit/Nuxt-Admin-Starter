// @vitest-environment node
import { beforeEach, expect, it } from "vitest";
import type { Db } from "../../../server/database/types";
import type { AdminActor } from "../../../server/services/authorization";
import { getDashboard, loadDashboardModule, resetDashboardArrangement, saveChartStyle, saveDashboardArrangement, saveModuleRange } from "../../../server/services/admin-dashboard.service";
import { createAnalyticsCache } from "../../../server/utils/analytics-cache";
import { dbSuite, useTestDatabase } from "../support/database";

// The per-User Dashboard layout against a real database (.specs/admin-dashboard/spec.md "Layout storage"): the default
// for a User with no row, the strict Save with its version check, unknown keys dropped on read and on the next Save,
// Reset to default, the saved range and Chart style, and the module endpoint's own gate.
dbSuite("Dashboard layout", () => {
  const database = useTestDatabase();
  const db = () => database.db as unknown as Db;

  async function actor(phone: string, permissions: string[]): Promise<AdminActor> {
    const { rows } = await database.pool.query("INSERT INTO users (phone_e164, phone_verified_at) VALUES ($1, now()) RETURNING id", [phone]);
    return { userId: rows[0].id as string, sessionId: "s", isSuper: false, permissions, has: (key) => permissions.includes(key) };
  }
  const row = async (userId: string) => (await database.pool.query("SELECT * FROM dashboard_preferences WHERE user_id = $1", [userId])).rows[0];

  beforeEach(() => database.truncate());

  it("gives a User with no row the default layout, filtered by what they may see", async () => {
    const viewer = await actor("+989120000001", ["view-users"]);
    const nobody = await actor("+989120000002", []);
    expect(await getDashboard({ db: db() }, viewer)).toMatchObject({
      modules: [{ key: "new-accounts", width: "third", fill: false }],
      isDefault: true,
      ranges: { "new-accounts": "last-30-days" },
      chartStyle: "soft",
      arrangementUpdatedAt: null,
      pickerModules: ["new-accounts"],
    });
    expect(await getDashboard({ db: db() }, nobody)).toMatchObject({ modules: [], ranges: {}, pickerModules: [] });
    expect(await row(viewer.userId)).toBeUndefined();
  });

  it("saves strictly with a version check, then resets to the default", async () => {
    const viewer = await actor("+989120000003", ["view-users"]);
    const bad = (modules: unknown) => saveDashboardArrangement({ db: db() }, viewer, { modules, expectedUpdatedAt: null });
    await expect(bad([{ key: "nope", width: "third", fill: false }])).rejects.toMatchObject({ statusCode: 422 });
    await expect(bad([{ key: "new-accounts", width: "full", fill: false }])).rejects.toMatchObject({ statusCode: 422 });
    await expect(bad([{ key: "new-accounts", width: "half", fill: false, range: "today" }])).rejects.toMatchObject({ statusCode: 422 });

    const saved = await saveDashboardArrangement({ db: db() }, viewer, { modules: [{ key: "new-accounts", width: "half", fill: true }], expectedUpdatedAt: null });
    expect(saved).toMatchObject({ isDefault: false, modules: [{ key: "new-accounts", width: "half", fill: true }] });
    expect(saved.arrangementUpdatedAt).not.toBeNull();

    // Another device holding the old version loses; the one holding the new version wins.
    await expect(saveDashboardArrangement({ db: db() }, viewer, { modules: [], expectedUpdatedAt: null })).rejects.toMatchObject({ statusCode: 409, data: { code: "stale_layout" } });
    const emptied = await saveDashboardArrangement({ db: db() }, viewer, { modules: [], expectedUpdatedAt: saved.arrangementUpdatedAt });
    expect(emptied).toMatchObject({ isDefault: false, modules: [] });

    await expect(resetDashboardArrangement({ db: db() }, viewer, saved.arrangementUpdatedAt)).rejects.toMatchObject({ statusCode: 409 });
    const reset = await resetDashboardArrangement({ db: db() }, viewer, emptied.arrangementUpdatedAt);
    expect(reset).toMatchObject({ isDefault: true, modules: [{ key: "new-accounts", width: "third", fill: false }] });
    expect((await row(viewer.userId)).arrangement).toBeNull();
  });

  it("drops unknown keys on read and from the stored layout on the next Save", async () => {
    const viewer = await actor("+989120000004", ["view-users"]);
    const stored = { version: 1, modules: [{ key: "removed-module", width: "full", fill: false }, { key: "new-accounts", width: "half", fill: true }, { key: "new-accounts", width: "third", fill: false }] };
    await database.pool.query("INSERT INTO dashboard_preferences (user_id, arrangement, arrangement_updated_at) VALUES ($1, $2, now())", [viewer.userId, JSON.stringify(stored)]);

    const read = await getDashboard({ db: db() }, viewer);
    expect(read.modules).toEqual([{ key: "new-accounts", width: "half", fill: true }]);
    expect((await row(viewer.userId)).arrangement).toEqual(stored); // reading repairs in memory only

    await saveDashboardArrangement({ db: db() }, viewer, { modules: read.modules, expectedUpdatedAt: read.arrangementUpdatedAt });
    expect((await row(viewer.userId)).arrangement).toEqual({ version: 1, modules: [{ key: "new-accounts", width: "half", fill: true }] });
  });

  it("keeps a module the User cannot see in the stored layout across a Save", async () => {
    const viewer = await actor("+989120000005", ["view-users"]);
    const first = await saveDashboardArrangement({ db: db() }, viewer, { modules: [{ key: "new-accounts", width: "third", fill: false }], expectedUpdatedAt: null });
    const losing = { ...viewer, permissions: [], has: () => false };
    const hidden = await getDashboard({ db: db() }, losing);
    expect(hidden.modules).toEqual([]);
    await saveDashboardArrangement({ db: db() }, losing, { modules: [], expectedUpdatedAt: hidden.arrangementUpdatedAt });
    expect((await row(viewer.userId)).arrangement.modules).toEqual([{ key: "new-accounts", width: "third", fill: false }]);
    expect(first.modules).toHaveLength(1);
  });

  it("saves a range and a Chart style without touching the layout version", async () => {
    const viewer = await actor("+989120000006", ["view-users"]);
    await expect(saveModuleRange({ db: db() }, viewer, "new-accounts", "last-90-days")).rejects.toMatchObject({ statusCode: 422 });
    await expect(saveModuleRange({ db: db() }, viewer, "nope", "today")).rejects.toMatchObject({ statusCode: 404 });
    await expect(saveModuleRange({ db: db() }, await actor("+989120000007", []), "new-accounts", "today")).rejects.toMatchObject({ statusCode: 403 });
    await saveModuleRange({ db: db() }, viewer, "new-accounts", "today");
    await expect(saveChartStyle({ db: db() }, viewer, "neon")).rejects.toMatchObject({ statusCode: 422 });
    await saveChartStyle({ db: db() }, viewer, "glow");
    expect(await getDashboard({ db: db() }, viewer)).toMatchObject({ ranges: { "new-accounts": "today" }, chartStyle: "glow", arrangementUpdatedAt: null, isDefault: true });
  });

  it("answers a module only to a User holding its Permission, counting accounts live", async () => {
    const viewer = await actor("+989120000008", ["view-users"]);
    const cache = createAnalyticsCache();
    await expect(loadDashboardModule({ db: db(), cache }, await actor("+989120000009", []), "new-accounts", "today")).rejects.toMatchObject({ statusCode: 403 });
    await expect(loadDashboardModule({ db: db(), cache }, viewer, "nope", "today")).rejects.toMatchObject({ statusCode: 404 });
    const payload = (await loadDashboardModule({ db: db(), cache }, viewer, "new-accounts", "last-30-days")) as { newAccounts: { current: number }; totalAccounts: number; sparkline: unknown[]; range: string };
    expect(payload).toMatchObject({ range: "last-30-days", newAccounts: { current: 2 }, totalAccounts: 2 });
    expect(payload.sparkline.length).toBeGreaterThanOrEqual(30);
  });
});

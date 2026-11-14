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
const attention = { key: "needs-attention", width: "half", fill: false };
const accounts = (width = "third", fill = false) => ({ key: "new-accounts", width, fill });

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
      modules: expect.arrayContaining([attention, accounts()]),
      isDefault: true,
      ranges: { "new-accounts": "last-30-days" },
      chartStyle: "soft",
      arrangementUpdatedAt: null,
      pickerModules: expect.arrayContaining(["needs-attention", "new-accounts"]),
    });
    expect((await getDashboard({ db: db() }, viewer)).modules[0]).toEqual(attention);
    // Needs attention is the one module every signed-in User gets; its rows are gated one by one.
    expect(await getDashboard({ db: db() }, nobody)).toMatchObject({ modules: [attention], ranges: {}, pickerModules: ["needs-attention"] });
    expect(await row(viewer.userId)).toBeUndefined();
  });

  it("saves strictly with a version check, then resets to the default", async () => {
    const viewer = await actor("+989120000003", ["view-users"]);
    const bad = (modules: unknown) => saveDashboardArrangement({ db: db() }, viewer, { modules, expectedUpdatedAt: null });
    await expect(bad([{ key: "nope", width: "third", fill: false }])).rejects.toMatchObject({ statusCode: 422 });
    await expect(bad([{ key: "new-accounts", width: "full", fill: false }])).rejects.toMatchObject({ statusCode: 422 });
    await expect(bad([{ key: "new-accounts", width: "half", fill: false, range: "today" }])).rejects.toMatchObject({ statusCode: 422 });

    const saved = await saveDashboardArrangement({ db: db() }, viewer, { modules: [{ key: "new-accounts", width: "half", fill: true }], expectedUpdatedAt: null });
    expect(saved).toMatchObject({ isDefault: false, modules: [attention, accounts("half", true)] });
    expect(saved.arrangementUpdatedAt).not.toBeNull();

    // Another device holding the old version loses; the one holding the new version wins.
    await expect(saveDashboardArrangement({ db: db() }, viewer, { modules: [], expectedUpdatedAt: null })).rejects.toMatchObject({ statusCode: 409, data: { code: "stale_layout" } });
    const emptied = await saveDashboardArrangement({ db: db() }, viewer, { modules: [], expectedUpdatedAt: saved.arrangementUpdatedAt });
    expect(emptied).toMatchObject({ isDefault: false, modules: [attention] }); // the fixed module cannot be removed

    await expect(resetDashboardArrangement({ db: db() }, viewer, saved.arrangementUpdatedAt)).rejects.toMatchObject({ statusCode: 409 });
    const reset = await resetDashboardArrangement({ db: db() }, viewer, emptied.arrangementUpdatedAt);
    expect(reset).toMatchObject({ isDefault: true });
    expect(reset.modules).toEqual(expect.arrayContaining([attention, accounts()]));
    expect((await row(viewer.userId)).arrangement).toBeNull();
  });

  it("drops unknown keys on read and from the stored layout on the next Save", async () => {
    const viewer = await actor("+989120000004", ["view-users"]);
    const stored = { version: 1, modules: [{ key: "removed-module", width: "full", fill: false }, { key: "new-accounts", width: "half", fill: true }, { key: "new-accounts", width: "third", fill: false }] };
    await database.pool.query("INSERT INTO dashboard_preferences (user_id, arrangement, arrangement_updated_at) VALUES ($1, $2, date_trunc('milliseconds', now()))", [viewer.userId, JSON.stringify(stored)]);

    const read = await getDashboard({ db: db() }, viewer);
    expect(read.modules).toEqual([attention, accounts("half", true)]); // Needs attention is added in front
    expect((await row(viewer.userId)).arrangement).toEqual(stored); // reading repairs in memory only

    await saveDashboardArrangement({ db: db() }, viewer, { modules: read.modules, expectedUpdatedAt: read.arrangementUpdatedAt });
    expect((await row(viewer.userId)).arrangement).toEqual({ version: 1, modules: [attention, accounts("half", true)] });
  });

  it("keeps a module the User cannot see in the stored layout across a Save", async () => {
    const viewer = await actor("+989120000005", ["view-users"]);
    const first = await saveDashboardArrangement({ db: db() }, viewer, { modules: [attention, accounts()], expectedUpdatedAt: null });
    const losing = { ...viewer, permissions: [], has: () => false };
    const hidden = await getDashboard({ db: db() }, losing);
    expect(hidden.modules).toEqual([attention]);
    await saveDashboardArrangement({ db: db() }, losing, { modules: hidden.modules, expectedUpdatedAt: hidden.arrangementUpdatedAt });
    expect((await row(viewer.userId)).arrangement.modules).toEqual([attention, accounts()]);
    expect(first.modules).toContainEqual(accounts());
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

  it("answers Needs attention to every signed-in User with only the rows they may open", async () => {
    const nobody = await actor("+989120000010", []);
    expect(await loadDashboardModule({ db: db() }, nobody, "needs-attention", undefined)).toEqual({ rows: [] });
    // demo-ticket:start
    const staff = await actor("+989120000011", ["view-demo-tickets"]);
    expect(await loadDashboardModule({ db: db() }, staff, "needs-attention", undefined)).toEqual({ rows: [{ key: "openDemoTickets", count: 0 }] });
    await expect(loadDashboardModule({ db: db() }, nobody, "demo-tickets-by-status", undefined)).rejects.toMatchObject({ statusCode: 403 });
    expect(await loadDashboardModule({ db: db() }, staff, "demo-tickets-by-status", undefined)).toEqual({
      statuses: [
        { status: "open", count: 0 },
        { status: "in_progress", count: 0 },
        { status: "resolved", count: 0 },
        { status: "closed", count: 0 },
      ],
    });
    const perDay = (await loadDashboardModule({ db: db(), cache: createAnalyticsCache() }, staff, "demo-tickets-per-day", "last-7-days")) as { total: number; days: unknown[] };
    expect(perDay).toMatchObject({ total: 0 });
    expect(perDay.days).toHaveLength(7);
    // demo-ticket:end
  });
});

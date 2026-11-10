import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MODULE_COMPONENTS } from "~/components/admin/dashboard/module-components";
import { MODULE_RANGE_KEYS } from "~~/shared/constants/analytics";
import { DASHBOARD_MODULES, DASHBOARD_MODULE_LIMIT, PREVIEW_KINDS, moduleTitleKey } from "~~/shared/constants/dashboard-modules";
import { PERMISSION_KEYS } from "~~/shared/constants/permissions";
import { MODULE_PAYLOAD_SCHEMAS } from "~~/shared/schemas/admin-dashboard";
import { MODULE_LOADERS } from "../../../server/services/admin-dashboard.service";

// The Dashboard module registry's completeness test (.specs/admin-dashboard/spec.md "Modules"): every registered module has
// every piece, so adding an entry without one fails here (the typed lookups catch the same at compile time).
const root = join(__dirname, "../../..");
const css = readFileSync(join(root, "app/assets/css/tailwind.css"), "utf8");
const messages = (locale: string) => JSON.parse(readFileSync(join(root, "i18n/locales", `${locale}.json`), "utf8")) as unknown;
const en = messages("en");
const fa = messages("fa");
const lookup = (tree: unknown, path: string) => path.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree);

describe("the Dashboard module registry", () => {
  it("derives the module limit from its length and is internally consistent", () => {
    expect(DASHBOARD_MODULE_LIMIT).toBe(DASHBOARD_MODULES.length);
    expect(new Set(DASHBOARD_MODULES.map((module) => module.key)).size).toBe(DASHBOARD_MODULES.length);
    for (const module of DASHBOARD_MODULES) {
      expect(PERMISSION_KEYS).toContain(module.permission);
      expect(module.widths).toContain(module.defaultWidth);
      expect(PREVIEW_KINDS).toContain(module.preview);
      for (const range of module.ranges) expect(MODULE_RANGE_KEYS).toContain(range);
      if (module.ranges.length > 0) expect(module.ranges).toContain(module.defaultRange);
    }
  });

  it.each(DASHBOARD_MODULES.map((module) => [module.key]))("%s has a title in both languages, a loader, a component, a payload schema and a colour variable", (key) => {
    expect(lookup(en, moduleTitleKey(key)), "en title").toEqual(expect.any(String));
    expect(lookup(fa, moduleTitleKey(key)), "fa title").toEqual(expect.any(String));
    expect(Object.keys(MODULE_LOADERS)).toContain(key);
    expect(Object.keys(MODULE_COMPONENTS)).toContain(key);
    expect(Object.keys(MODULE_PAYLOAD_SCHEMAS)).toContain(key);
    expect(css).toContain(`[data-dashboard-module="${key}"]`);
    expect(css).toContain(`--dashboard-hue-${key}:`);
  });
});

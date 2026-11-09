// @vitest-environment node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "../../..");
const css = readFileSync(join(root, "app/assets/css/tailwind.css"), "utf8");
const components = JSON.parse(readFileSync(join(root, "components.json"), "utf8")) as { rtl?: boolean };

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** The body of the first rule whose selector line equals `selector`. */
function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`missing block ${selector}`);
  const end = css.indexOf("\n}", start);
  return css.slice(start, end);
}

describe("admin token layer", () => {
  it("has no hex colour literals in the stylesheet", () => {
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
  });

  it("has no storefront token layer or surface switch", () => {
    expect(css).not.toContain("--shop-");
    expect(css).not.toContain("data-surface");
  });

  it("loads fonts from self-hosted packages, never a font CDN", () => {
    expect(css).not.toContain("fonts.googleapis.com");
    expect(css).not.toContain("fonts.gstatic.com");
    for (const weight of ["400", "500", "600"]) {
      expect(css).toContain(`@fontsource/inter/latin-${weight}.css`);
      expect(css).toContain(`@fontsource/vazirmatn/arabic-${weight}.css`);
    }
  });

  it("enables the nine shadcn data-* variants", () => {
    const names = ["open", "closed", "checked", "unchecked", "selected", "disabled", "active", "horizontal", "vertical"];
    for (const name of names) expect(css).toContain(`@custom-variant data-${name} `);
    expect(css.match(/@custom-variant data-/g)).toHaveLength(names.length);
  });

  it("enables shadcn RTL", () => {
    expect(components.rtl).toBe(true);
  });

  it("defines the six status tone pairs for light and dark", () => {
    for (const tone of ["neutral", "info", "progress", "warning", "success", "danger"]) {
      for (const scope of [":root", ".dark"]) {
        const body = block(scope);
        expect(body, `${scope} ${tone}`).toContain(`--status-${tone}:`);
        expect(body, `${scope} ${tone} foreground`).toContain(`--status-${tone}-foreground:`);
      }
      expect(css).toContain(`--color-status-${tone}: var(--status-${tone})`);
      expect(css).toContain(`--color-status-${tone}-foreground: var(--status-${tone}-foreground)`);
    }
  });

  it("switches to Vazirmatn for Persian text", () => {
    expect(block("html:lang(fa)")).toContain('"Vazirmatn", "Inter"');
  });
});

describe("Vue components", () => {
  it("contain no hard-coded hex colors", () => {
    const hex = /(?<![&\w])#[0-9a-fA-F]{6}\b|(?<![&\w])#[0-9a-fA-F]{3}\b(?![\w-])/;
    const offenders = walk(join(root, "app"))
      .filter((file) => file.endsWith(".vue"))
      .filter((file) => hex.test(readFileSync(file, "utf8")))
      .map((file) => relative(root, file));
    expect(offenders).toEqual([]);
  });
});

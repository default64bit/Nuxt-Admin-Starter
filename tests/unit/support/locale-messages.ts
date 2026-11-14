import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(__dirname, "../../../i18n/locales");

type Tree = Record<string, unknown>;

function merge(into: Tree, from: Tree): Tree {
  for (const [key, value] of Object.entries(from)) {
    const existing = into[key];
    if (value && typeof value === "object" && existing && typeof existing === "object") merge(existing as Tree, value as Tree);
    else into[key] = value;
  }
  return into;
}

/**
 * A locale's messages as the app loads them: `<code>.json` merged with every feature file `<feature>.<code>.json`
 * beside it (see `localeFiles` in nuxt.config.ts).
 */
export function loadLocaleMessages(code: string): Tree {
  const files = [`${code}.json`, ...readdirSync(dir).filter((name) => name.endsWith(`.${code}.json`)).sort()];
  return files.reduce<Tree>((tree, file) => merge(tree, JSON.parse(readFileSync(join(dir, file), "utf8")) as Tree), {});
}

// Starter-only (starter-meta): `just first-run` sets up a Project created from the Starter, then deletes this script.
//   tsx scripts/starter/first-run.ts [step] key=value ...
// Steps (each callable alone): all (default), rename, profiles, env, strip.
// Named arguments: name-en, name-fa, slug, demo=keep|remove (default keep), profiles=<list>|none, push=on|off,
// admin-phone, admin-given-name, admin-family-name. Missing arguments are asked for only when stdin is a terminal.
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { demoRemove } from "../demo/demo-remove.ts";
import { stripTree } from "../demo/strip-markers.ts";

export const STARTER_SLUG = "nuxt-admin-starter";
export const STARTER_REPO_REF = "default64bit/Nuxt-Admin-Starter";
export const STARTER_DOC = "docs/starter.md";
export const PROFILES = ["media", "monitoring", "edge", "backup"] as const;
/** Removal checklist per Optional piece, keyed by the profile or Channel switch that turns it Off. */
const CHECKLISTS: Record<string, string> = {
  media: "docs/optional-pieces/media.md",
  monitoring: "docs/optional-pieces/glitchtip.md",
  edge: "docs/optional-pieces/caddy.md",
  backup: "docs/optional-pieces/backups.md",
  push: "docs/optional-pieces/web-push-pwa.md",
};
/** Files and directories that exist only in the Starter. */
export const STARTER_ONLY_PATHS = ["docs/starter.md", "CHANGELOG.md", ".github/workflows/starter-release.yml", "scripts/starter", "tests/starter"];
const ENV_EXAMPLES = [".env.example", "deploy/production.env.example"];

const SKIPPED_DIRS = new Set([".git", "node_modules", ".nuxt", ".output", ".claude", ".agents", ".data", "playwright-report", "test-results"]);
const NOT_RENAMED = new Set(["CHANGELOG.md", "pnpm-lock.yaml", "scripts/starter", "tests/starter"]);

export type Names = { nameEn: string; nameFa: string; slug: string };

export function validateSlug(slug: string): void {
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(slug)) throw new Error(`slug must be lowercase letters, digits and single hyphens, starting with a letter: ${JSON.stringify(slug)}`);
}

/** `owner/repo` of the origin remote (ssh or https), or null without one. */
export function parseRepoRef(url: string): { owner: string; repo: string } | null {
  const match = /[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url.trim());
  return match ? { owner: match[1]!, repo: match[2]! } : null;
}

function originRef(root: string): { owner: string; repo: string } | null {
  try {
    return parseRepoRef(execFileSync("git", ["remote", "get-url", "origin"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    return null;
  }
}

/** The display name of each locale, from the i18n `app.name` setting. */
export function readDisplayNames(root: string): { en: string; fa: string } {
  const read = (locale: string) => {
    const name = (JSON.parse(readFileSync(join(root, "i18n", "locales", `${locale}.json`), "utf8")) as { app?: { name?: string } }).app?.name;
    if (!name) throw new Error(`i18n/locales/${locale}.json has no app.name`);
    return name;
  };
  return { en: read("en"), fa: read("fa") };
}

function walkFiles(root: string, visit: (rel: string, full: string) => void): void {
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const rel = relative(root, full).split("\\").join("/");
      if (SKIPPED_DIRS.has(name) || NOT_RENAMED.has(rel)) continue;
      if (statSync(full).isDirectory()) walk(full);
      else visit(rel, full);
    }
  };
  walk(root);
}

/** Replaces the Starter's slug, repository reference and both display names in every text file, and renames files named after the slug. */
export function renameProject(root: string, names: Names, remote: { owner: string; repo: string } | null = originRef(root)): { changedFiles: string[]; renamedFiles: string[] } {
  validateSlug(names.slug);
  const starter = readDisplayNames(root);
  // Longest and most specific first, so the slug rule never rewrites part of a reference already handled.
  const rules: [string, string][] = [];
  if (remote) {
    rules.push([`ghcr.io/default64bit/${STARTER_SLUG}`, `ghcr.io/${remote.owner.toLowerCase()}/${remote.repo.toLowerCase()}`]);
    rules.push([STARTER_REPO_REF, `${remote.owner}/${remote.repo}`]);
  }
  rules.push([STARTER_SLUG, names.slug], [starter.en, names.nameEn], [starter.fa, names.nameFa]);
  // One pass over a single alternation, so text produced by one rule is never rewritten by another.
  const replacements = new Map(rules);
  const pattern = new RegExp([...replacements.keys()].sort((a, b) => b.length - a.length).map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
  const changedFiles: string[] = [];
  const renamedFiles: string[] = [];
  const files: [string, string][] = [];
  walkFiles(root, (rel, full) => files.push([rel, full]));
  for (const [rel, full] of files) {
    const buffer = readFileSync(full);
    if (buffer.includes(0)) continue;
    const text = buffer.toString("utf8");
    let next = text;
    next = next.replace(pattern, (hit) => replacements.get(hit) ?? hit);
    if (next !== text) {
      writeFileSync(full, next);
      changedFiles.push(rel);
    }
    const base = basename(full);
    if (base.includes(STARTER_SLUG)) {
      const target = join(dirname(full), base.split(STARTER_SLUG).join(names.slug));
      renameSync(full, target);
      renamedFiles.push(relative(root, target).split("\\").join("/"));
    }
  }
  return { changedFiles, renamedFiles };
}

/** Sets `KEY=value` in env-file text: replaces the line when present, appends it otherwise. */
export function setEnvKey(text: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(text)) return text.replace(pattern, () => line);
  return `${text.replace(/\n*$/, "\n")}${line}\n`;
}

export function parseProfiles(value: string): string[] {
  const list = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (list.length === 1 && list[0] === "none") return [];
  const unknown = list.filter((item) => !(PROFILES as readonly string[]).includes(item));
  if (unknown.length) throw new Error(`unknown profile(s): ${unknown.join(", ")} (known: ${PROFILES.join(", ")})`);
  return [...new Set(list)];
}

export type PieceChoice = { profiles?: string[]; push?: boolean };

/** Writes the chosen `COMPOSE_PROFILES` and Channel kill switch into the committed env examples. */
export function writePieceChoice(root: string, choice: PieceChoice): void {
  for (const rel of ENV_EXAMPLES) {
    const path = join(root, rel);
    if (!existsSync(path)) continue;
    let text = readFileSync(path, "utf8");
    if (choice.profiles) text = setEnvKey(text, "COMPOSE_PROFILES", choice.profiles.join(","));
    if (choice.push !== undefined) text = setEnvKey(text, "NUXT_ADMIN_CHANNEL_PUSH_ENABLED", String(choice.push));
    writeFileSync(path, text);
  }
}

/** Removal-checklist paths of the pieces the choice turns Off. */
export function offChecklists(choice: PieceChoice): string[] {
  const off = [...(choice.profiles ? PROFILES.filter((profile) => !choice.profiles!.includes(profile)) : []), ...(choice.push === false ? ["push"] : [])];
  return off.map((key) => CHECKLISTS[key]!);
}

export type AdminValues = { phone?: string; givenName?: string; familyName?: string };

/** Creates `.env` from `.env.example` (kept when it exists), fills fresh secrets and the Default admin. Local only; never committed. */
export function createLocalEnv(root: string, admin: AdminValues): void {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) copyFileSync(join(root, ".env.example"), envPath);
  let text = readFileSync(envPath, "utf8");
  for (const key of ["NUXT_SESSION_PASSWORD", "NUXT_IP_HASH_SECRET"]) {
    if (new RegExp(`^${key}=change-me`, "m").test(text)) text = setEnvKey(text, key, randomBytes(32).toString("hex"));
  }
  if (admin.phone) text = setEnvKey(text, "DEFAULT_ADMIN_PHONE", admin.phone);
  if (admin.givenName) text = setEnvKey(text, "DEFAULT_ADMIN_GIVEN_NAME", admin.givenName);
  if (admin.familyName) text = setEnvKey(text, "DEFAULT_ADMIN_FAMILY_NAME", admin.familyName);
  writeFileSync(envPath, text);
}

export function projectReadme(names: Names): string {
  return `# ${names.nameEn}

${names.nameFa}

An admin panel built from the Nuxt Admin Starter. Read \`AGENTS.md\` before changing anything: it lists the specs, decisions and rules this Project follows.

## Quick start

Needs Docker with Compose, [\`just\`](https://github.com/casey/just), and Node 24 (\`.nvmrc\`) with pnpm via corepack.

\`\`\`bash
just dev       # the whole dev stack in Docker with HMR on http://localhost:3000
just install && just lint && just typecheck && just test && just build
\`\`\`

\`.env\` was created by \`just first-run\`; \`COMPOSE_PROFILES\` in it switches infrastructure Optional pieces on and off. See \`docs/architecture/local-development-deployment.md\`.

\`.starter-release\` records the Starter release this Project has ported up to.
`;
}

/** Strips the starter-meta sections, deletes the Starter-only files and swaps the README for a Project stub. */
export function stripStarterMeta(root: string, names?: Names): string[] {
  const messages: string[] = [];
  const result = stripTree(root, "starter-meta");
  messages.push(`Stripped starter-meta sections from ${result.strippedFiles.length} files.`);
  for (const rel of STARTER_ONLY_PATHS) rmSync(join(root, rel), { recursive: true, force: true });
  messages.push(`Deleted ${STARTER_ONLY_PATHS.join(", ")}.`);
  if (names) {
    writeFileSync(join(root, "README.md"), projectReadme(names));
    messages.push("Replaced README.md with a Project stub (LICENSE untouched).");
  }
  return messages;
}

export type Args = Record<string, string>;

export function parseArgs(argv: string[]): { step: string; args: Args } {
  const steps = ["all", "rename", "profiles", "env", "strip"];
  const step = argv[0] && !argv[0].includes("=") ? argv[0] : "all";
  if (!steps.includes(step)) throw new Error(`unknown step ${JSON.stringify(step)} (steps: ${steps.join(", ")})`);
  const args: Args = {};
  for (const item of argv.slice(step === argv[0] ? 1 : 0)) {
    const index = item.indexOf("=");
    if (index < 1) throw new Error(`arguments are key=value pairs, got ${JSON.stringify(item)}`);
    args[item.slice(0, index)] = item.slice(index + 1);
  }
  const known = ["name-en", "name-fa", "slug", "demo", "profiles", "push", "admin-phone", "admin-given-name", "admin-family-name"];
  const unknown = Object.keys(args).filter((key) => !known.includes(key));
  if (unknown.length) throw new Error(`unknown argument(s): ${unknown.join(", ")} (known: ${known.join(", ")})`);
  return { step, args };
}

async function fillMissing(args: Args, keys: { key: string; question: string; required: boolean; fallback?: string }[]): Promise<Args> {
  const missing = keys.filter(({ key }) => args[key] === undefined);
  if (!missing.length) return args;
  const interactive = Boolean(process.stdin.isTTY);
  const filled = { ...args };
  const rl = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  try {
    for (const { key, question, required, fallback } of missing) {
      if (!rl) {
        if (required) throw new Error(`missing argument ${key}= (stdin is not a terminal, so nothing is prompted)`);
        continue;
      }
      const answer = (await rl.question(`${question}${fallback !== undefined ? ` [${fallback}]` : ""}: `)).trim();
      if (answer) filled[key] = answer;
      else if (fallback !== undefined) filled[key] = fallback;
      else if (required) throw new Error(`${key} is required`);
    }
  } finally {
    rl?.close();
  }
  return filled;
}

function currentProfiles(root: string): string {
  const match = /^COMPOSE_PROFILES=(.*)$/m.exec(readFileSync(join(root, ".env.example"), "utf8"));
  return match?.[1] || "none";
}

function namesFrom(args: Args): Names {
  return { nameEn: args["name-en"]!, nameFa: args["name-fa"]!, slug: args["slug"]! };
}

const NAME_QUESTIONS = [
  { key: "name-en", question: "English display name", required: true },
  { key: "name-fa", question: "Persian display name", required: true },
  { key: "slug", question: "Slug (lowercase, hyphens; names compose, images, units)", required: true },
];

export async function run(argv: string[], root = process.cwd(), log: (line: string) => void = console.log): Promise<void> {
  const { step, args: given } = parseArgs(argv);
  const whole = step === "all";
  if (whole && !existsSync(join(root, STARTER_DOC))) {
    throw new Error(`${STARTER_DOC} is gone, so this copy is already set up. first-run runs once and refuses now.`);
  }
  let args = given;
  if (whole || step === "rename") args = await fillMissing(args, NAME_QUESTIONS);
  if (whole) {
    args = await fillMissing(args, [
      { key: "demo", question: "Keep the demo ticket module (keep|remove)", required: false, fallback: "keep" },
      { key: "profiles", question: `Optional pieces to run (${PROFILES.join(",")}|none)`, required: false, fallback: currentProfiles(root) },
      { key: "push", question: "Web Push Channel (on|off)", required: false, fallback: "on" },
      { key: "admin-phone", question: "Default admin phone (local .env only; empty to set later)", required: false, fallback: "" },
      { key: "admin-given-name", question: "Default admin given name", required: false, fallback: "" },
      { key: "admin-family-name", question: "Default admin family name", required: false, fallback: "" },
    ]);
  } else if (step === "env") {
    args = await fillMissing(args, [{ key: "admin-phone", question: "Default admin phone (local .env only)", required: false, fallback: "" }]);
  }
  const demo = args["demo"] ?? "keep";
  if (demo !== "keep" && demo !== "remove") throw new Error(`demo must be keep or remove, got ${JSON.stringify(demo)}`);
  const push = args["push"] === undefined ? undefined : args["push"] === "on" || args["push"] === "true";
  if (args["push"] !== undefined && !["on", "off", "true", "false"].includes(args["push"])) throw new Error("push must be on or off");
  const choice: PieceChoice = { profiles: args["profiles"] === undefined ? undefined : parseProfiles(args["profiles"]), push };
  const names = whole || step === "rename" ? namesFrom(args) : undefined;
  if (names) validateSlug(names.slug);

  if (whole && demo === "remove") for (const line of demoRemove({ root, deployed: false })) log(line);
  if (names) {
    const result = renameProject(root, names);
    log(`Renamed: ${result.changedFiles.length} files rewritten, ${result.renamedFiles.length} renamed.`);
  }
  if (whole || step === "profiles") {
    writePieceChoice(root, choice);
    log(`Wrote COMPOSE_PROFILES=${choice.profiles?.join(",") ?? "(unchanged)"} and the Web Push switch (${push === undefined ? "unchanged" : push ? "on" : "off"}) into ${ENV_EXAMPLES.join(" and ")}.`);
    const checklists = offChecklists(choice);
    if (checklists.length) log(`Pieces turned Off. To remove one for good, follow its checklist:\n${checklists.map((path) => `  ${path}`).join("\n")}`);
  }
  if (whole || step === "env") {
    createLocalEnv(root, { phone: args["admin-phone"], givenName: args["admin-given-name"], familyName: args["admin-family-name"] });
    log("Created .env (local only) from .env.example with fresh secrets.");
    if (!args["admin-phone"]) log("No Default admin phone given: set DEFAULT_ADMIN_PHONE in .env before `just db-prepare`, or the seed warns and skips.");
  }
  if (whole || step === "strip") for (const line of stripStarterMeta(root, whole ? names : undefined)) log(line);
  if (whole) log("Done. Next: `just dev`. The Starter's release record `.starter-release` stays as your \"ported up to\" marker.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).catch((error: unknown) => {
    console.error(`first-run: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}

// Starter-only release checks (starter-meta: deleted by `just first-run`).
// Run directly by Node (type stripping), so keep the syntax erasable: no enums, no parameter properties.
//   node scripts/starter/release.ts check     PR to main: `.starter-release` is newer than the latest tag and the
//                                             changelog has its section with Unreleased emptied
//   node scripts/starter/release.ts version   push to main: validate `.starter-release` and print the tag name
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export type Version = readonly [major: number, minor: number, patch: number];

const VERSION_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Parses a tag such as `v0.1.0`; returns null for anything else (no pre-release or build suffixes). */
export function parseVersion(tag: string): Version | null {
  const match = VERSION_PATTERN.exec(tag);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function compareVersions(a: Version, b: Version): number {
  for (let i = 0; i < 3; i++) {
    if (a[i]! !== b[i]!) return a[i]! < b[i]! ? -1 : 1;
  }
  return 0;
}

/** `.starter-release` holds exactly one line: the release tag, with an optional trailing newline. */
export function parseReleaseFile(text: string): { tag: string; version: Version } | { error: string } {
  const tag = text.endsWith("\n") ? text.slice(0, -1) : text;
  const version = parseVersion(tag);
  if (!version) {
    return {
      error: `.starter-release must be one line "vMAJOR.MINOR.PATCH" (for example v0.1.0), found ${JSON.stringify(text)}`,
    };
  }
  return { tag, version };
}

/** Highest semver tag of the form `vMAJOR.MINOR.PATCH`; other tags are ignored. */
export function latestTag(tags: readonly string[]): string | null {
  let best: { tag: string; version: Version } | null = null;
  for (const tag of tags) {
    const version = parseVersion(tag);
    if (version && (!best || compareVersions(version, best.version) > 0)) best = { tag, version };
  }
  return best?.tag ?? null;
}

/** The `## [name]` heading line and the text under it up to the next level-2 heading; null when missing. */
function section(changelog: string, name: string): { heading: string; body: string } | null {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith(`## [${name}]`));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return { heading: lines[start]!, body: (end === -1 ? rest : rest.slice(0, end)).join("\n") };
}

const withoutComments = (text: string) => text.replace(/<!--[\s\S]*?-->/g, "").trim();

export interface ReleaseCheckInput {
  releaseFile: string;
  changelog: string;
  tags: readonly string[];
}

/** Returns every problem found; an empty list means the release PR is acceptable. */
export function checkRelease({ releaseFile, changelog, tags }: ReleaseCheckInput): string[] {
  const release = parseReleaseFile(releaseFile);
  if ("error" in release) return [release.error];

  const errors: string[] = [];
  const latest = latestTag(tags);
  if (latest && compareVersions(release.version, parseVersion(latest)!) <= 0) {
    errors.push(`.starter-release (${release.tag}) must be newer than the latest tag (${latest}); bump it.`);
  }

  const released = section(changelog, release.tag);
  if (!released) {
    errors.push(`CHANGELOG.md has no "## [${release.tag}] - YYYY-MM-DD" section.`);
  } else {
    if (!/^## \[[^\]]+\] - \d{4}-\d{2}-\d{2}$/.test(released.heading)) {
      errors.push(`The changelog heading must read "## [${release.tag}] - YYYY-MM-DD", found "${released.heading}".`);
    }
    if (withoutComments(released.body) === "") errors.push(`The changelog section for ${release.tag} is empty.`);
  }

  const unreleased = section(changelog, "Unreleased");
  if (!unreleased) {
    errors.push(`CHANGELOG.md has no "## [Unreleased]" section.`);
  } else if (withoutComments(unreleased.body) !== "") {
    errors.push(`The "Unreleased" section must be empty in a release PR; move its entries under ${release.tag}.`);
  }

  return errors;
}

function main(command: string | undefined): number {
  const releaseFile = readFileSync(".starter-release", "utf8");
  if (command === "version") {
    const release = parseReleaseFile(releaseFile);
    if ("error" in release) {
      console.error(`error: ${release.error}`);
      return 1;
    }
    console.log(release.tag);
    return 0;
  }
  if (command === "check") {
    const tags = execFileSync("git", ["tag", "--list", "v*"], { encoding: "utf8" }).split("\n").filter(Boolean);
    const errors = checkRelease({ releaseFile, changelog: readFileSync("CHANGELOG.md", "utf8"), tags });
    for (const error of errors) console.error(`error: ${error}`);
    if (errors.length === 0) {
      console.log(`Release ${releaseFile.trim()} is ready (latest tag: ${latestTag(tags) ?? "none"}).`);
    }
    return errors.length === 0 ? 0 : 1;
  }
  console.error("usage: node scripts/starter/release.ts check|version");
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv[2]);
}

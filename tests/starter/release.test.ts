// Starter-only (starter-meta): `just first-run` deletes tests/starter.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { checkRelease, latestTag, parseReleaseFile, parseVersion } from "../../scripts/starter/release";

const changelog = (unreleased: string, released = "- Added a thing.") =>
  `# Changelog\n\n## [Unreleased]\n${unreleased}\n## [v0.2.0] - 2026-12-01\n${released}\n\n## [v0.1.0] - 2026-11-20\n- First.\n`;

describe(".starter-release format", () => {
  it("is one line holding a vMAJOR.MINOR.PATCH tag", () => {
    expect(parseReleaseFile("v0.1.0\n")).toMatchObject({ tag: "v0.1.0", version: [0, 1, 0] });
    expect(parseReleaseFile("v10.2.30")).toMatchObject({ tag: "v10.2.30" });
    for (const bad of ["", "\n", "0.1.0\n", "v0.1\n", "v01.1.0\n", "v0.1.0-rc.1\n", "v0.1.0\nv0.2.0\n", " v0.1.0\n", "v0.1.0\n\n"]) {
      expect(parseReleaseFile(bad), JSON.stringify(bad)).toHaveProperty("error");
    }
  });

  it("holds a valid tag in the committed file", () => {
    expect(parseReleaseFile(readFileSync(".starter-release", "utf8"))).not.toHaveProperty("error");
  });
});

describe("release check", () => {
  const tags = ["v0.1.0", "v0.1.10", "v0.1.9", "not-a-release"];

  it("picks the highest semver tag, not the lexical one", () => {
    expect(latestTag(tags)).toBe("v0.1.10");
    expect(latestTag([])).toBeNull();
    expect(parseVersion("v0.1.10")).toEqual([0, 1, 10]);
  });

  it("accepts a bumped release with its changelog section and an empty Unreleased", () => {
    expect(checkRelease({ releaseFile: "v0.2.0\n", changelog: changelog("\n<!-- entries go here -->\n"), tags })).toEqual([]);
    expect(checkRelease({ releaseFile: "v0.1.0\n", changelog: changelog(""), tags: [] })).toEqual([]);
  });

  it("rejects a release that is not newer than the latest tag", () => {
    for (const releaseFile of ["v0.1.10\n", "v0.1.9\n"]) {
      expect(checkRelease({ releaseFile, changelog: changelog(""), tags }).join()).toContain("newer than the latest tag");
    }
  });

  it("rejects a missing or empty changelog section and a non-empty Unreleased", () => {
    expect(checkRelease({ releaseFile: "v0.3.0\n", changelog: changelog(""), tags }).join()).toContain("no \"## [v0.3.0]");
    expect(checkRelease({ releaseFile: "v0.2.0\n", changelog: changelog("", "<!-- nothing -->"), tags }).join()).toContain("is empty");
    expect(checkRelease({ releaseFile: "v0.2.0\n", changelog: changelog("- Pending."), tags }).join()).toContain("Unreleased");
  });

  it("rejects a malformed .starter-release", () => {
    expect(checkRelease({ releaseFile: "0.2.0\n", changelog: changelog(""), tags })).toHaveLength(1);
  });
});

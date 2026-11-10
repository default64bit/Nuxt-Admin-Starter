// @vitest-environment node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Contract test for .github/workflows/release-images.yml (ADR-0020). The workflow runs only on main and tags, so these
// static assertions guard its release invariants on every change. It must hold in a Project too, where `just first-run`
// has stripped the starter-meta lines, so the Starter-only expectations are stated on both forms of the file.
const workflow = readFileSync(".github/workflows/release-images.yml", "utf8");
const stripStarterMeta = (text: string) => text.replace(/^[ \t]*#[ \t]*starter-meta:start[\s\S]*?^[ \t]*#[ \t]*starter-meta:end[^\n]*\n/gm, "");
const projectWorkflow = stripStarterMeta(workflow);

describe("release-images workflow", () => {
  it("runs for main pushes and v* tags, after the CI gates", () => {
    expect(workflow).toMatch(/branches: \[main\]/);
    expect(workflow).toContain('tags: ["v*"]');
    expect(workflow).not.toMatch(/master/);
    expect(workflow).toMatch(/uses: \.\/\.github\/workflows\/ci\.yml/);
    expect(workflow).toMatch(/publish:[\s\S]*?needs: ci/);
  });

  it("allows a manual run with a self-hosted runner and, on main only, without CI; a failed or cancelled CI still blocks", () => {
    expect(workflow).toMatch(/workflow_dispatch:\n\s+inputs:\n\s+runner:[\s\S]*?options: \[ubuntu-24\.04, self-hosted\][\s\S]*?skip_ci:[\s\S]*?type: boolean\n\s+default: false/);
    expect(workflow).toContain("if: ${{ !(inputs.skip_ci && github.ref == 'refs/heads/main') }}");
    expect(workflow).toContain("if: ${{ !cancelled() && (needs.ci.result == 'success' || needs.ci.result == 'skipped') }}");
    expect(workflow.match(/runs-on: \$\{\{ inputs\.runner \|\| 'ubuntu-24\.04' \}\}/g)).toHaveLength(2);
    expect(workflow.match(/cache-to: \$\{\{ inputs\.runner != 'self-hosted' && 'type=gha,scope=\w+,mode=max' \|\| '' \}\}/g)).toHaveLength(6);
  });

  it("pushes runtime and tools images tagged only by the full commit SHA, and aliases a version tag to the same digest", () => {
    expect(workflow).toMatch(/target: runtime[\s\S]*?tags: \$\{\{ steps\.names\.outputs\.app \}\}:\$\{\{ github\.sha \}\}/);
    expect(workflow).toMatch(/target: tools[\s\S]*?tags: \$\{\{ steps\.names\.outputs\.tools \}\}:\$\{\{ github\.sha \}\}/);
    expect(workflow).not.toMatch(/:latest|type=raw|type=ref|type=edge|latest=true/);
    expect(workflow).toMatch(/for image in "\$\{\{ steps\.names\.outputs\.app \}\}" "\$\{\{ steps\.names\.outputs\.tools \}\}" "\$\{\{ steps\.names\.outputs\.backup \}\}"; do/);
    expect(workflow).toMatch(/ghcr-retry\.sh docker buildx imagetools create --tag "\$\{image\}:\$\{GITHUB_REF_NAME\}" "\$\{image\}:\$\{GITHUB_SHA\}"/);
  });

  it("scopes package write to the publish job and passes no secret to image builds", () => {
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n/m);
    expect(workflow.match(/packages: write/g)).toHaveLength(1);
    expect(workflow.match(/deployments: write/g)).toHaveLength(1);
    expect(workflow).not.toMatch(/secrets: inherit|build-args:/);
    expect(workflow.match(/secrets\.[A-Z_]+/g)).toEqual(["secrets.GITHUB_TOKEN"]);
  });

  it("mirrors the pinned base images before building, and retries each build once after a failed push", () => {
    expect(workflow).toContain('scripts/ops/copy-base-images.sh "${{ steps.names.outputs.base }}"');
    expect(workflow.indexOf("copy-base-images.sh")).toBeLessThan(workflow.indexOf("Build and push runtime image"));
    for (const target of ["runtime", "tools", "backup"]) {
      expect(workflow).toMatch(new RegExp(`id: push-${target}\\n\\s+if: steps\\.existing\\.outputs\\.exists != 'true'\\n\\s+continue-on-error: true`));
      expect(workflow).toContain(`if: steps.push-${target}.outcome == 'failure'`);
    }
    expect(readFileSync("scripts/ops/copy-base-images.sh", "utf8")).toContain('scripts/ops/ghcr-retry.sh docker buildx imagetools create --tag "$dest" "$ref"');
  });
});

describe("release-images workflow: deployment job", () => {
  const job = /\n {2}deploy:\n([\s\S]*)$/.exec(workflow)?.[1] ?? "";

  it("is the last job: after CI (or its manual skip) and publish, for main pushes and manual main runs only", () => {
    expect(job).toMatch(/needs: \[ci, publish\]/);
    expect(job).toContain("needs.publish.result == 'success'");
    expect(job).toContain("(needs.ci.result == 'success' || needs.ci.result == 'skipped')");
    expect(job).toContain("(github.event_name == 'push' || github.event_name == 'workflow_dispatch') && github.ref == 'refs/heads/main'");
  });

  it("queues a production Deployment for the SHA with no required contexts and holds only deployments: write", () => {
    expect(job).toContain("createDeployment");
    expect(job).toContain("ref: context.sha");
    expect(job).toContain("DEPLOYMENT_ENVIRONMENT: production");
    expect(job).toContain("required_contexts: []");
    expect(job).toContain("auto_merge: false");
    expect(job).toContain('state: "queued"');
    expect(job).toMatch(/permissions:\n {6}deployments: write\n/);
    expect(job).not.toMatch(/packages:|contents: write|id-token/);
  });

  it("skips the Deployment step in the Starter through a starter-meta block, and runs it once the block is stripped", () => {
    const marked = /# starter-meta:start\n[\s\S]*?STARTER_SKIP_DEPLOYMENT: "true"\n\s+# starter-meta:end/.test(workflow);
    expect(marked).toBe(workflow.includes("STARTER_SKIP_DEPLOYMENT:"));
    // The step condition survives stripping; with the variable unset it is true, so a Project queues the Deployment.
    expect(projectWorkflow).not.toContain("STARTER_SKIP_DEPLOYMENT:");
    expect(projectWorkflow).toContain("if: ${{ env.STARTER_SKIP_DEPLOYMENT != 'true' }}");
    expect(projectWorkflow).toMatch(/env:\n\s+DEPLOYMENT_ENVIRONMENT: production\n\s+steps:/);
  });
});

describe("copy-base-images.sh", () => {
  const prefix = "ghcr.io/example-owner/example-repo/base";
  const list = spawnSync("scripts/ops/copy-base-images.sh", ["--list", prefix], { encoding: "utf8" });
  const pairs = list.stdout.trim().split("\n").map((line) => line.split(" ") as [string, string]);

  it("covers every digest pin of the base file and of the Caddy base image file", () => {
    expect(list.status).toBe(0);
    const compose = readFileSync("compose.yaml", "utf8");
    const pinned = [...compose.matchAll(/^\s*image:\s*(\S+@sha256:[0-9a-f]{64})\s*$/gm)].map((match) => match[1]!);
    const caddy = readFileSync("ops/caddy/base-images.txt", "utf8").split("\n").filter((line) => /^[^#\s]/.test(line));
    const sources = pairs.map(([source]) => source);
    expect(pinned.length).toBeGreaterThan(0);
    expect(caddy).toHaveLength(1);
    expect([...sources].sort()).toEqual([...pinned, ...caddy].sort());
  });

  it("copies to the destinations the production overlay pulls, with the same digest", () => {
    const prod = readFileSync("compose.prod.yaml", "utf8");
    for (const [source, dest] of pairs) {
      const digest = source.split("@")[1];
      expect(prod.includes(`/base/${dest.split("/base/")[1]}@${digest}`)).toBe(true);
    }
  });
});

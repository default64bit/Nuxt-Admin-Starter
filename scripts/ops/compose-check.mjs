// Validates the fully resolved dev and prod Compose configurations. Non-mutating; starts nothing.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

// APP_IMAGE_TAG is only known at release time; a placeholder lets the production overlay resolve here.
const envFile = process.env.COMPOSE_CHECK_ENV_FILE || (existsSync(".env") ? ".env" : ".env.example");
// The Optional-piece profiles (ADR-0029). `ops` holds the one-shot jobs and is not part of the COMPOSE_PROFILES list.
const PIECE_PROFILES = ["media", "monitoring", "edge", "backup"];
const KNOWN_PROFILES = new Set([...PIECE_PROFILES, "ops"]);
// Services that may publish a port on every interface: the edge proxy, the only public listener.
const publicServices = new Set(["caddy"]);
// The services each Optional piece adds. Each must exist and sit behind its piece's profile, so that Off removes it.
const PIECE_SERVICES = {
  monitoring: ["glitchtip", "monitoring-db-init"],
};
// Services that must always run, whichever Optional pieces are switched off.
const coreServices = ["postgres", "app"];
const DEV_IMAGE = "nuxt-admin-starter-dev:";
const GHCR_PREFIX = "ghcr.io/default64bit/nuxt-admin-starter/";
const DIGEST = /@sha256:[0-9a-f]{64}$/;
// The stock Caddy image production runs: the one digest-pinned line of ops/caddy/base-images.txt (read next to this
// script), which the release workflow mirrors under `base/` and compose.prod.yaml pins.
const CADDY_BASE = readFileSync(new URL("../../ops/caddy/base-images.txt", import.meta.url), "utf8")
  .split("\n")
  .map((line) => line.trim())
  .find((line) => /^caddy:[^@\s]+@sha256:[0-9a-f]{64}$/.test(line));
if (!CADDY_BASE) throw new Error("ops/caddy/base-images.txt has no digest-pinned caddy:<tag>@sha256:... line");
const stacks = {
  dev: ["compose.yaml", "compose.dev.yaml"],
  prod: ["compose.yaml", "compose.prod.yaml"],
};

/** The `COMPOSE_PROFILES` list: the env file wins, then the process environment. */
function selectedProfiles() {
  let raw = process.env.COMPOSE_PROFILES ?? "";
  if (existsSync(envFile)) {
    const line = readFileSync(envFile, "utf8")
      .split("\n")
      .find((l) => /^\s*COMPOSE_PROFILES\s*=/.test(l));
    if (line) {
      raw = line
        .slice(line.indexOf("=") + 1)
        .replace(/\s+#.*$/, "")
        .trim()
        .replace(/^(["'])(.*)\1$/, "$2");
    }
  }
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

function resolve(stack, files) {
  const args = ["compose", "--env-file", envFile, ...files.flatMap((f) => ["-f", f]), "--profile", "*", "config", "--format", "json"];
  const env = { ...process.env, COMPOSE_FILE: "", COMPOSE_PROFILES: "", APP_IMAGE_TAG: process.env.APP_IMAGE_TAG || "compose-check" };
  const result = spawnSync("docker", args, { encoding: "utf8", env });
  if (result.status !== 0) return { errors: [`[${stack}] cannot resolve configuration: ${result.stderr.trim() || result.error?.message}`] };
  return { config: JSON.parse(result.stdout), errors: [] };
}

function inspect(stack, config, selected) {
  const errors = [];
  const services = config.services ?? {};
  // A service runs when it has no profile or one of its profiles is switched on; `ops` jobs run on demand.
  const isActive = (service) => !service.profiles?.length || service.profiles.some((p) => p === "ops" || selected.includes(p));
  for (const [name, service] of Object.entries(services)) {
    const tag = (service.image ?? "").split("@")[0].split("/").pop().split(":")[1];
    if (!service.image && !service.build) errors.push(`[${stack}] ${name}: has neither image nor build`);
    if (service.image && (!tag || tag === "latest")) errors.push(`[${stack}] ${name}: image "${service.image}" must use a pinned tag, not latest/untagged`);
    if (service.image && stack === "dev" && !service.image.startsWith(DEV_IMAGE) && !DIGEST.test(service.image)) {
      errors.push(`[${stack}] ${name}: base image "${service.image}" must be pinned by digest (name:tag@sha256:...)`);
    }
    if (service.image && stack === "prod") {
      if (!service.image.startsWith(GHCR_PREFIX)) errors.push(`[${stack}] ${name}: image "${service.image}" must be pulled from ${GHCR_PREFIX}`);
      else if (service.image.startsWith(`${GHCR_PREFIX}base/`) && !DIGEST.test(service.image)) {
        errors.push(`[${stack}] ${name}: base image "${service.image}" must be pinned by digest (name:tag@sha256:...)`);
      }
    }
    if (stack === "prod" && name === "caddy" && !service.image?.endsWith(`/base/${CADDY_BASE}`)) {
      errors.push(`[${stack}] caddy: image "${service.image}" must be the mirrored base image ${GHCR_PREFIX}base/${CADDY_BASE} (ops/caddy/base-images.txt)`);
    }
    if (stack === "prod" && service.build) errors.push(`[${stack}] ${name}: has a build section; production images come from the registry`);
    const logging = service.logging;
    if (logging?.driver !== "json-file" || !logging.options?.["max-size"] || !logging.options?.["max-file"]) {
      errors.push(`[${stack}] ${name}: missing json-file log rotation (max-size and max-file)`);
    }
    if (!publicServices.has(name)) {
      for (const port of service.ports ?? []) {
        if (port.host_ip !== "127.0.0.1") errors.push(`[${stack}] ${name}: port ${port.published}->${port.target} is not bound to 127.0.0.1`);
      }
    }
    for (const profile of service.profiles ?? []) {
      if (!KNOWN_PROFILES.has(profile)) errors.push(`[${stack}] ${name}: unknown profile "${profile}" (expected ${[...KNOWN_PROFILES].join(", ")})`);
    }
    // Off must be a no-code-change switch: a service that runs may only require services that run with it.
    if (isActive(service)) {
      for (const [dependency, options] of Object.entries(service.depends_on ?? {})) {
        const target = services[dependency];
        if (target && !isActive(target) && options.required !== false) {
          errors.push(`[${stack}] ${name}: requires "${dependency}" (profile ${target.profiles.join(", ")}), which is Off in COMPOSE_PROFILES; mark the dependency required: false or put ${name} behind the same profile`);
        }
      }
    }
  }
  for (const name of coreServices) {
    if (!services[name]) errors.push(`[${stack}] expected service "${name}" is missing`);
    else if (services[name].profiles?.length) errors.push(`[${stack}] ${name}: core service must not sit behind a profile`);
  }
  // Edge Off keeps the app reachable for the Project's own proxy: the shared file publishes it on the loopback.
  if (!(services.app?.ports ?? []).some((port) => port.host_ip === "127.0.0.1" && port.target === 3000)) {
    errors.push(`[${stack}] app: must publish port 3000 on 127.0.0.1 so a proxy of the Project can reach it when the edge profile is Off`);
  }
  // The edge proxy exists in production only, behind its profile, and is the one service that may publish publicly.
  if (stack === "prod" && !services.caddy) errors.push(`[${stack}] caddy service is missing`);
  else if (stack === "prod" && !services.caddy.profiles?.includes("edge")) errors.push(`[${stack}] caddy: must sit behind the edge profile`);
  if (stack === "dev" && services.caddy) errors.push(`[${stack}] caddy must not be part of the dev stack`);
  for (const [piece, names] of Object.entries(PIECE_SERVICES)) {
    for (const name of names) {
      if (!services[name]) errors.push(`[${stack}] expected service "${name}" of the ${piece} piece is missing`);
      else if (!services[name].profiles?.includes(piece)) errors.push(`[${stack}] ${name}: must sit behind the "${piece}" profile so that Off removes it`);
    }
  }
  return errors;
}

// The prod overlay mirrors each digest-pinned base image of the shared file under the project's GHCR `base/` namespace
// with the same tag and digest (CI copies them unchanged), so a version bump is one tag-plus-digest edit.
function compareBaseImages(dev, prod) {
  const errors = [];
  for (const [name, service] of Object.entries(dev.services ?? {})) {
    const match = /^(?:.*\/)?([^/:@]+):([^@]+)(@sha256:[0-9a-f]{64})$/.exec(service.image ?? "");
    if (!match || !prod.services?.[name]) continue;
    const expected = `${GHCR_PREFIX}base/${match[1]}:${match[2]}${match[3]}`;
    const actual = prod.services[name].image ?? "";
    if (!actual.endsWith(`/base/${match[1]}:${match[2]}${match[3]}`) && actual.startsWith(GHCR_PREFIX)) {
      errors.push(`[prod] ${name}: image "${actual}" does not match the base file pin; expected "${expected}"`);
    }
  }
  return errors;
}

const errors = [];
const selected = selectedProfiles();
for (const profile of selected) {
  if (!PIECE_PROFILES.includes(profile)) errors.push(`COMPOSE_PROFILES: unknown profile "${profile}" (expected a list of ${PIECE_PROFILES.join(", ")})`);
}
const resolved = {};
for (const [stack, files] of Object.entries(stacks)) {
  const { config, errors: resolveErrors } = resolve(stack, files);
  resolved[stack] = config;
  errors.push(...resolveErrors, ...(config ? inspect(stack, config, selected) : []));
}
if (resolved.dev && resolved.prod) errors.push(...compareBaseImages(resolved.dev, resolved.prod));
if (errors.length) {
  console.error(errors.join("\n"));
  console.error(`\ncompose-check FAILED (${errors.length} problem${errors.length === 1 ? "" : "s"}).`);
  process.exit(1);
}
console.log(`compose-check passed: dev and prod configurations resolve and satisfy the exposure, tag, logging and profile rules (COMPOSE_PROFILES: ${selected.join(",") || "none"}).`);

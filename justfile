set dotenv-load := true
set export := true

# Show every command and its help text.
default:
    @just --list

# Install dependencies and create/update pnpm-lock.yaml. Commit the lockfile afterward.
install:
    corepack pnpm install

# CI / Docker: reproducible install only; fails if the lockfile is stale or absent.
ci-install:
    corepack pnpm install --frozen-lockfile

# Start the Nuxt dev server with HMR on http://localhost:3000.
dev:
    corepack pnpm dev

# Quality gates.
lint:
    corepack pnpm lint

typecheck:
    corepack pnpm typecheck

# Unit and component tests.
test:
    corepack pnpm test

build:
    corepack pnpm build

# Dependency vulnerability audit: fails on any high/critical advisory.
audit:
    corepack pnpm audit --audit-level high

# Scan the working tree and git history for committed secrets (runs gitleaks in Docker).
secret-scan:
    docker run --rm -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks:v8.28.0 git /repo --config /repo/.gitleaks.toml --redact --no-banner

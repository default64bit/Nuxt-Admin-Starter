# Node 24 LTS runtime. Keep the major aligned with package.json, .nvmrc and CI.
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
WORKDIR /app
RUN corepack enable

# Copy source before install: the package postinstall runs `nuxt prepare`, which requires nuxt.config.ts.
FROM base AS build
COPY . .
RUN corepack pnpm install --frozen-lockfile
RUN corepack pnpm exec nuxt prepare
RUN corepack pnpm build

# Development image: dependencies baked in, source is bind-mounted by compose.dev.yaml and node_modules lives in a
# named volume. Runs as the unprivileged node user (uid 1000) so files written to the bind mount stay user-owned.
FROM base AS dev
ENV NODE_ENV=development
RUN mkdir -p /app && chown node:node /app
USER node
COPY --chown=node:node . .
RUN corepack pnpm install --frozen-lockfile
ENTRYPOINT ["/app/scripts/docker/dev-entrypoint.sh"]
CMD ["corepack", "pnpm", "exec", "nuxt", "dev", "--host", "0.0.0.0"]

# Operational image: source and dev tooling for the one-shot jobs (migrations, seeds, database ensure) and any worker.
FROM build AS tools
ENV NODE_ENV=production
CMD ["corepack", "pnpm", "db:migrate"]

# Minimal runtime image: the compiled Nitro output only, run as a non-root user.
FROM base AS runtime
ENV NODE_ENV=production NITRO_HOST=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.output ./.output
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]

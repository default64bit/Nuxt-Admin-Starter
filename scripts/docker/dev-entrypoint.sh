#!/bin/sh
# Dev container entrypoint: keep the node_modules volume in sync with the lockfile, then run the command.
set -eu
corepack pnpm install --frozen-lockfile
exec "$@"

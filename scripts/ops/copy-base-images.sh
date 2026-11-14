#!/usr/bin/env bash
# Mirrors every digest-pinned base image unchanged into GHCR: ghcr.io/<owner>/<repo>/base/<name>:<tag>.
# Sources: the `image:` lines of compose.yaml (shared base file) and ops/caddy/base-images.txt (the stock Caddy image).
# A version bump is therefore one tag-plus-digest edit in those files; this script follows it.
#   copy-base-images.sh --list <dest-prefix>   print "<source> <destination>" pairs, copy nothing
#   copy-base-images.sh <dest-prefix>          copy and verify the destination digest equals the pinned digest
set -euo pipefail
cd "$(dirname "$0")/../.."

mode=copy
if [ "${1:-}" = "--list" ]; then mode=list; shift; fi
prefix="${1:?usage: copy-base-images.sh [--list] <dest-prefix, e.g. ghcr.io/owner/repo/base>}"

refs=$( { sed -n 's/^[[:space:]]*image:[[:space:]]*\(.*@sha256:[0-9a-f]\{64\}\)[[:space:]]*$/\1/p' compose.yaml
          # The Caddy file is absent once the edge piece is Removed.
          if [ -f ops/caddy/base-images.txt ]; then grep -E '^[^#[:space:]]' ops/caddy/base-images.txt || true; fi; } | sort -u)
[ -n "$refs" ] || { echo "no digest-pinned base images found" >&2; exit 1; }

while IFS= read -r ref; do
  if ! [[ "$ref" =~ ^([^@]+)@(sha256:[0-9a-f]{64})$ ]]; then echo "base image without digest pin: $ref" >&2; exit 1; fi
  nametag="${BASH_REMATCH[1]}"; digest="${BASH_REMATCH[2]}"
  name="${nametag%:*}"; tag="${nametag##*:}"
  dest="${prefix}/${name##*/}:${tag}"
  if [ "$mode" = list ]; then echo "$ref $dest"; continue; fi
  # A new package can deny its first push until GHCR links it to the repository; ghcr-retry.sh retries that only.
  scripts/ops/ghcr-retry.sh docker buildx imagetools create --tag "$dest" "$ref"
  actual=$(docker buildx imagetools inspect "$dest" --format '{{.Manifest.Digest}}')
  if [ "$actual" != "$digest" ]; then echo "digest mismatch for $dest: expected $digest, got $actual" >&2; exit 1; fi
  echo "copied $ref -> $dest"
done <<< "$refs"

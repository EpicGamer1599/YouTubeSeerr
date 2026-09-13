#!/bin/sh
set -eu
cd "$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"

case "${1:-}" in
  --docker)
    command -v docker >/dev/null 2>&1 || {
      echo 'Docker Engine or Desktop with Compose v2 is required. See START-HERE.md.' >&2
      exit 1
    }
    docker compose build
    echo 'Docker build complete. Run docker compose up -d to start both services.'
    ;;
  '')
    command -v node >/dev/null 2>&1 &&
      node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 15) ? 0 : 1)' || {
        echo 'Node.js 22.15 or later with npm is required. See START-HERE.md.' >&2
        exit 1
      }
    echo 'Installing locked dependencies and compiling YouTubeSeerr...'
    npm ci --include=dev
    npm run build
    echo 'Build complete. Compiled files are in dist.'
    echo 'Run npm start and npm run worker in separate terminals.'
    ;;
  *)
    echo 'Usage: sh compile.sh [--docker]' >&2
    exit 1
    ;;
esac

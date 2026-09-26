#!/usr/bin/env bash
# One-time dependency install. Run on the machine that will run the game (not in a Linux VM:
# vite/esbuild ship platform-specific binaries). Versions resolve to latest and get recorded
# in package.json + package-lock.json.
set -euo pipefail
cd "$(dirname "$0")/.."

npm install \
  react react-dom \
  three @react-three/fiber @react-three/drei \
  zustand

npm install -D \
  vite @vitejs/plugin-react \
  typescript @types/react @types/react-dom @types/three @types/node \
  vitest tsx \
  eslint @eslint/js typescript-eslint eslint-plugin-react-hooks globals \
  prettier

echo "Done. Next: npm run typecheck && npm test && npm run dev"

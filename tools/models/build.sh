#!/usr/bin/env bash
# Build model scripts headless in Blender, check each GLB, then rebuild the contact sheets.
#   tools/models/build.sh                    every script in bugs/, towers/, barricades/, props/
#   tools/models/build.sh bugs/skitterling   one (or several) models
# Each model runs in its own Blender process. Exits non-zero if any model fails.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"

if [[ ! -x "$BLENDER" ]]; then
  echo "Blender not found at $BLENDER (set BLENDER=...)" >&2
  exit 2
fi

scripts=()
if [[ $# -eq 0 ]]; then
  for kind in bugs towers barricades props; do
    for f in "$HERE/$kind"/*.py; do [[ -e "$f" ]] && scripts+=("$f"); done
  done
else
  for arg in "$@"; do
    f="$HERE/${arg%.py}.py"
    if [[ ! -f "$f" ]]; then echo "no such model script: tools/models/${arg%.py}.py" >&2; exit 2; fi
    scripts+=("$f")
  done
fi

failed=()
for f in "${scripts[@]}"; do
  kind="$(basename "$(dirname "$f")")"
  id="$(basename "$f" .py)"
  log="$HERE/previews/.${id}.log"
  printf '%-28s' "$kind/$id"
  start=$SECONDS
  if "$BLENDER" --background --factory-startup --python-exit-code 1 --python "$f" >"$log" 2>&1; then
    if node "$HERE/check.mjs" --quiet "$ROOT/public/models/$kind/$id.glb" >>"$log" 2>&1; then
      echo "ok   $(grep -o '\] OK .*tris' "$log" | sed 's/.*OK *//')  ($((SECONDS - start)) s)"
      grep -h 'warning:' "$log" | sed 's/^/    /'
      rm -f "$log"
      continue
    fi
  fi
  echo "FAILED  ($((SECONDS - start)) s), log: tools/models/previews/.${id}.log"
  grep -E 'Error|error|VIOLATION|^  - |FAIL' "$log" | grep -v '^Blender quit' | tail -25 | sed 's/^/    /'
  failed+=("$kind/$id")
done

# contact sheets (cheap; only when something was built)
if [[ ${#scripts[@]} -gt 0 ]]; then
  "$BLENDER" --background --factory-startup --python-exit-code 1 --python "$HERE/sheet.py" >/dev/null 2>&1 \
    || echo "contact sheets failed: run $BLENDER --background --factory-startup --python tools/models/sheet.py"
fi

if [[ ${#failed[@]} -gt 0 ]]; then
  echo "${#failed[@]} failed: ${failed[*]}" >&2
  exit 1
fi

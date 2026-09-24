#!/usr/bin/env bash
# Regenerates every .glb in public/models from the scripted Blender sources.
# Usage: npm run models            (all)
#        npm run models -- boat fish (subset: builder names from tools/blender/world.py, or "fish")
set -euo pipefail
cd "$(dirname "$0")/.."
BLENDER="${BLENDER:-$(command -v blender || echo /Applications/Blender.app/Contents/MacOS/Blender)}"
"$BLENDER" -b --factory-startup -P tools/blender/build_all.py -- public/models "$@"

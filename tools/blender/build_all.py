"""Entry point: blender -b --factory-startup -P tools/blender/build_all.py -- <outdir> [only...]"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import fish  # noqa: E402
import world  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
outdir = os.path.abspath(args[0] if args else "public/models")
only = set(args[1:])
os.makedirs(outdir, exist_ok=True)

if not only or "fish" in only:
    fish.build(outdir)
for fn in world.BUILDERS:
    if not only or fn.__name__ in only:
        fn(outdir)

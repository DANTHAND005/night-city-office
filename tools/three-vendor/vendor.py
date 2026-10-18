"""Copy the pinned three.js build, its license and the post-processing add-ons the room needs into
dashboard/static/vendor/three. The add-ons import the bare name 'three', which needs an import map;
the dashboard's CSP blocks inline scripts (an import map is one), so those imports are rewritten to
relative paths to the local build. Run after `npm install` here."""
import json
import pathlib
import posixpath
import re
import shutil

HERE = pathlib.Path(__file__).resolve().parent
PKG = HERE / "node_modules" / "three"
OUT = HERE.parent.parent / "dashboard" / "static" / "vendor" / "three"
ENTRIES = ["postprocessing/EffectComposer.js", "postprocessing/RenderPass.js",
           "postprocessing/UnrealBloomPass.js", "postprocessing/OutputPass.js"]
IMPORT = re.compile(r"""(from\s+|import\s+)(['"])([^'"]+)\2""")

version = json.loads((PKG / "package.json").read_text(encoding="utf-8"))["version"]
if OUT.exists():
    shutil.rmtree(OUT)
(OUT / "addons").mkdir(parents=True)
shutil.copy2(PKG / "build" / "three.module.min.js", OUT / "three.module.min.js")
shutil.copy2(PKG / "LICENSE", OUT / "LICENSE")

done, todo = set(), list(ENTRIES)
while todo:
    rel = todo.pop()
    if rel in done:
        continue
    done.add(rel)
    src = (PKG / "examples" / "jsm" / rel).read_text(encoding="utf-8")
    dest = OUT / "addons" / rel
    to_build = pathlib.PurePosixPath(*[".."] * len(pathlib.PurePosixPath(rel).parts), "three.module.min.js")

    def fix(m):
        spec = m.group(3)
        if spec == "three":
            return f"{m.group(1)}{m.group(2)}{to_build}{m.group(2)}"
        if spec.startswith("."):
            todo.append(posixpath.normpath(posixpath.join(posixpath.dirname(rel), spec)))
            return m.group(0)
        raise SystemExit(f"{rel}: unexpected import {spec}")

    out = IMPORT.sub(fix, src)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(out, encoding="utf-8", newline="\n")

# every rewritten 'three' import must point at the real build
for p in OUT.joinpath("addons").rglob("*.js"):
    for m in IMPORT.finditer(p.read_text(encoding="utf-8")):
        target = (p.parent / m.group(3)).resolve()
        assert target.is_file(), f"{p}: import {m.group(3)} does not resolve"
(OUT / "VERSION").write_text(f"three {version} from npm; add-ons rewritten by tools/three-vendor/vendor.py\n", encoding="utf-8")
print(f"three {version}: copied {len(done)} add-on files to {OUT}")
for p in sorted(OUT.rglob("*")):
    if p.is_file():
        print(f"  {p.relative_to(OUT).as_posix()}  {p.stat().st_size}")

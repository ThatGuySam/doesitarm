#!/usr/bin/env python3
"""Generate 169 Applications-style bundles containing exactly 300,000 files."""

import json
from collections import Counter
from pathlib import Path
import sys
from runpy import run_path

base = run_path(str(Path(__file__).with_name("generate-bigfolder.py")))
BINARIES = base["BINARIES"]
Tree = base["Tree"]


def generate(parent):
    tree = Tree(parent / "Applications", include_file_list=False)
    tree.root.mkdir()
    depths = Counter()
    # A few large frameworks and language packs alongside many small bundles.
    weights = [(rank + 5) ** -1.15 for rank in range(169)]
    remaining = 300_000 - len(weights) * 3
    sizes = [int(remaining * weight / sum(weights)) for weight in weights]
    for rank in range(remaining - sum(sizes)):
        sizes[rank] += 1

    for rank, files in enumerate(sizes):
        name = f"Product {rank:03}"
        app = Path("Utilities" if rank % 13 == 12 else ".") / f"{name}.app"
        tree.app(app, ("thin", "fat", "intel")[rank % 3], index=rank)
        tree.write(app / "Contents/Frameworks/SuiteRuntime.framework/Versions/A/SuiteRuntime",
                   BINARIES["fat"][0])
        depths.update((len(app.parts) + 2, len(app.parts) + 3, len(app.parts) + 6))
        locations = [
            ("Resources", 9),
            ("Resources/{group}.lproj", 16),
            ("Resources/Assets/{group}", 20),
            ("Frameworks/SuiteRuntime.framework/Versions/A/Resources/{group}", 40),
            ("Resources/vendor/node_modules/pkg-{group}/dist/locales/en", 15),
        ]
        assigned = 0
        for index, (location, share) in enumerate(locations):
            count = files - assigned if index == len(locations) - 1 else files * share // 100
            groups = max(1, (count + 399) // 400) if "{group}" in location else 1
            base, extra = divmod(count, groups)
            for group in range(groups):
                path = app / "Contents" / location.format(group=f"{group:03}")
                amount = base + (group < extra)
                tree.fillers(path, amount)
                # A short, non-Mach-O resource forces some real header reads.
                if amount:
                    (tree.root / path / "cache-000000.dat").write_bytes(b"example resource\n")
                depths[len(path.parts) + 1] += amount
            assigned += count
    assert tree.files == sum(depths.values()) == 300_000
    print(json.dumps({"files": tree.files, "apps": len(weights), "files_by_depth": dict(sorted(depths.items())),
                      "largest_bundle_files": max(sizes) + 3, "directories": len(tree.directories)}))


if __name__ == "__main__":
    generate(Path(sys.argv[1]))

#!/usr/bin/env python3
"""Vendor shadcn's MIT-licensed registry and example sources for the review route."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import re
import shutil
import tempfile
from urllib.parse import quote
from urllib.request import Request, urlopen

REPO = "https://github.com/shadcn-ui/ui"
RAW = "https://raw.githubusercontent.com/shadcn-ui/ui"
API = "https://api.github.com/repos/shadcn-ui/ui/git/trees"
REGISTRY = "https://ui.shadcn.com/r/styles"
CURRENT = "0e5b2e621a9ee4cf6a604bbe6c5c0d5b70561eb4"
ARCHIVE = "shadcn@3.0.0"
REVIEW = Path(__file__).resolve().parent.parent
SOURCE = REVIEW / "src"
STYLES = ("new-york-v4", "radix-nova", "base-nova")
ATOMS = ("button", "badge", "input", "label", "kbd", "separator", "spinner", "avatar", "skeleton", "typography")
CURRENT_APPS = ("dashboard", "authentication", "tasks", "playground", "rtl")
ARCHIVED_APPS = ("cards", "forms", "forms/account", "forms/appearance", "forms/notifications", "forms/display", "mail", "music")
SUPPORT = (
    "components/icons.tsx", "components/language-selector.tsx", "components/markdown.tsx",
    "components/message-parts.tsx", "components/message-animated.tsx",
    "hooks/use-copy-to-clipboard.ts", "hooks/use-media-query.tsx", "hooks/use-mutation-observer.ts",
    "lib/ai.ts", "lib/message-animations.ts", "registry/icons/__lucide__.ts",
    "registry/new-york-v4/examples/form-next-complex-action.ts",
    "registry/new-york-v4/examples/form-next-complex-schema.ts",
    "registry/new-york-v4/examples/form-next-demo-action.ts",
    "registry/new-york-v4/examples/form-next-demo-schema.ts",
)
STANDALONE = {
    "chart-tooltip": "chart",
    "data-picker-with-dropdowns": "date-picker",
    "file-upload-list": "attachment",
    "muted-item-group": "item",
    "outline-item-group": "item",
    "radio-fields": "radio-group",
}
BLOCK_LABELS = {
    "dashboard-01": "Dashboard",
    "preview": "Component showcase",
    "preview-02": "Card compositions",
    "preview-03": "AI chat compositions",
}
CHART_GROUPS = {
    "area": "Area charts",
    "bar": "Bar charts",
    "line": "Line charts",
    "pie": "Pie charts",
    "radar": "Radar charts",
    "radial": "Radial charts",
    "tooltip": "Chart tooltips",
}
SOURCE_EXTENSIONS = (".ts", ".tsx", ".json")
ASSET_LITERAL = re.compile(
    r'(["\x27\x60])(/(?:avatars|examples)/[^"\x27\x60\s]+?\.(?:svg|png|jpeg|jpg|webp|gif|avif)|/placeholder\.svg)(?=\1)',
    flags=re.I,
)


def fetch(url, path):
    if not path.exists():
        for attempt in range(3):
            try:
                request = Request(url, headers={"User-Agent": "doesitarm-shadcn-review"})
                with urlopen(request, timeout=30) as response:
                    data = response.read()
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
                break
            except OSError:
                if attempt == 2:
                    raise
    return path


def get_json(url, path):
    return json.loads(fetch(url, path).read_text())


def read_inputs(cache):
    indexes = {}
    downloads = []
    for style in STYLES:
        index = get_json(f"{REGISTRY}/{style}/registry.json", cache / style / "registry.json")
        indexes[style] = index if isinstance(index, list) else index["items"]

        keys = {"registry:hook", "registry:lib", "registry:ui"}
        if style == "new-york-v4":
            keys.update(("registry:block", "registry:example", "registry:internal"))
        if style == "radix-nova":
            keys.update(("registry:block", "registry:example", "registry:component"))

        for item in indexes[style]:
            if item["type"] in keys:
                name = item["name"]
                downloads.append((f"{REGISTRY}/{style}/{name}.json", cache / style / f"{name}.json"))

    downloads.extend((f"{REGISTRY}/new-york/{name}.json", cache / f"{name}.json") for name in ("toast", "toast-demo"))
    downloads.append((f"{RAW}/{CURRENT}/LICENSE.md", cache / "LICENSE.md"))

    for revision, folder, base, tree_file in (
        (CURRENT, "current", "apps/v4", "tree.json"),
        (ARCHIVE, "legacy", "apps/www", "legacy-tree.json"),
    ):
        tree = get_json(f"{API}/{quote(revision)}?recursive=1", cache / tree_file)
        prefix = f"{base}/app/(app)/examples/"
        apps = CURRENT_APPS if folder == "current" else ARCHIVED_APPS
        for node in tree["tree"]:
            path = node["path"]
            if node["type"] != "blob":
                continue
            include = (
                path.startswith(prefix)
                and path.endswith(SOURCE_EXTENSIONS)
                and not path.endswith("/seed.ts")
                and any(path.startswith(f"{prefix}{app}/") for app in apps)
            )
            if folder == "current":
                include |= path.removeprefix("apps/v4/") in SUPPORT
                include |= bool(re.fullmatch(r"apps/v4/examples/radix/[^/]+\.tsx", path))
                include |= bool(re.fullmatch(r"apps/v4/content/docs/components/radix/[^/]+\.mdx", path))
                include |= bool(re.fullmatch(r"apps/v4/registry/bases/radix/blocks/preview(?:-0[23])?/(?:cards|components)/.*\.(?:ts|tsx|json)", path))
            if include:
                downloads.append((f"{RAW}/{quote(revision)}/{quote(path)}", cache / folder / path))

    with ThreadPoolExecutor(max_workers=16) as pool:
        for future in [pool.submit(fetch, url, path) for url, path in downloads]:
            future.result()

    return indexes


def rewrite(source, path):
    source = re.sub(r'(["\x27])@/styles/(radix-nova|radix-rhea|base-nova|base-rhea)/ui(?:-rtl)?/', lambda match: (
        f"{match[1]}@/registry/{'base-nova' if match[2] == 'base-nova' else 'radix-nova'}/ui/"
    ), source)
    source = source.replace("@/registry/bases/base/hooks/use-highlighted-code", "@/registry/radix-nova/hooks/use-highlighted-code")
    source = source.replace("@/registry/bases/radix/", "@/registry/radix-nova/")
    source = source.replace("@/registry/bases/base/", "@/registry/base-nova/")
    source = source.replace("@/registry/base-nova/components/example", "@/registry/radix-nova/components/example")
    source = source.replace("@/registry/new-york/hooks/use-toast", "@/registry/legacy/hooks/use-toast")
    source = source.replace("@/registry/new-york/ui/toast", "@/registry/legacy/ui/toast")
    source = source.replace("@/registry/new-york/ui/", "@/registry/new-york-v4/ui/")
    source = source.replace("@/registry/default/examples/", "@/registry/new-york-v4/examples/")
    source = source.replace("@/registry/default/ui/", "@/registry/new-york-v4/ui/")
    source = source.replace("@/lib/utils", "@/registry/new-york-v4/lib/utils")
    source = re.sub(r"@/app/(?:\(app\)/)?\(?create\)?/components/icon-placeholder", "@/preview-adapters/icon-placeholder", source)
    source = re.sub(r"@/app/(?:\(app\)/)?\(?create\)?/lib/search-params", "@/preview-adapters/search-params", source)
    source = source.replace("@/app/(create)/lib/fonts", "@/preview-adapters/search-params")
    source = source.replace('from "@/registry/styles"', 'from "@/preview-adapters/search-params"')
    for name in ("button", "input"):
        source = source.replace(f"@/components/ui/{name}", f"@/registry/radix-nova/ui/{name}")
    source = source.replace("@/components/ui/toast", "@/registry/legacy/ui/toast")
    source = source.replace("@/hooks/use-toast", "@/registry/legacy/hooks/use-toast")
    source = source.replace('"next-themes"', '"@/preview-adapters/theme"')
    source = source.replace('"next/navigation"', '"@/preview-adapters/next"')
    source = source.replace('"next/font/google"', '"@/preview-adapters/next"')
    source = source.replace('from "next"', 'from "@/preview-adapters/next"')
    for upstream, adapter in (("image", "PreviewImage"), ("link", "PreviewLink"), ("form", "PreviewForm")):
        source = re.sub(
            rf'import (\w+) from "next/{upstream}"',
            lambda match: f'import {{ {adapter} as {match[1]} }} from "@/preview-adapters/next"',
            source,
        )
    if path.startswith(("examples-app/", "examples-archive/")):
        folder = path.partition("/")[0]
        source = source.replace("@/app/(app)/examples/", f"@/{folder}/")
    if path == "examples-app/tasks/page.tsx":
        source = re.sub(r'^import .* from "(fs|path)"\n', "", source, flags=re.M)
        source = re.sub(
            r"// Simulate a database read for tasks\..*?const tasks = await getTasks\(\)",
            'import tasksData from "./data/tasks.json"\n\nexport default function TaskPage() {\n  const tasks = z.array(taskSchema).parse(tasksData)',
            source,
            flags=re.S,
        )
    if path == "examples-archive/mail/page.tsx":
        source = source.replace('import { cookies } from "next/headers"\n', "")
        source = re.sub(
            r"  const layout = cookies\(\).*?  return \(",
            "  return (",
            source,
            flags=re.S,
        )
        source = source.replace("defaultLayout={defaultLayout}", "defaultLayout={undefined}")
        source = source.replace("          defaultCollapsed={defaultCollapsed}\n", "")
    if path == "examples-archive/mail/components/mail.tsx":
        source = source.replace('direction="horizontal"', 'orientation="horizontal"')
        source = re.sub(r'        onLayout=\{\(sizes: number\[\]\) => \{.*?        \}\}\n', "", source, flags=re.S)
        source = re.sub(r"          onCollapse=\{\(\) => \{.*?          \}\}\n", "", source, flags=re.S)
        source = re.sub(
            r"          onResize=\{\(\) => \{.*?          \}\}\n",
            "          onResize={({ asPercentage }) => setIsCollapsed(asPercentage <= navCollapsedSize)}\n",
            source,
            flags=re.S,
        )
        source = re.sub(r"(defaultSize|collapsedSize)=\{([^}]+)\}", r'\1={\2 + "%"}', source)
        source = re.sub(r"(minSize|maxSize)=\{(\d+)\}", r'\1="\2%"', source)
    if path.endswith("/ui/sidebar.tsx"):
        source = re.sub(r'^\s*// This sets the cookie[^\n]*\n\s*document.cookie = [^\n]*\n', "\n", source, flags=re.M)
        source = re.sub(r'^const SIDEBAR_COOKIE_.*\n', "", source, flags=re.M)
    source = re.sub(r'^"use (?:client|server)"\n\n', "", source)
    return re.sub(r"(?m)^[ \t]+$", "", source)


def vendor_file(path, content):
    output = SOURCE / path
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.suffix not in (".tsx", ".ts"):
        output.write_text(content)
        return
    output.write_text(rewrite(content, path))


def prefer_default(path, source):
    if re.search(r"\bexport\s+default\s", source):
        return source
    name = next(iter(re.findall(r"^export (?:function|const|class) ([A-Z]\w*)", source, flags=re.M)), None)
    if name is None:
        raise ValueError(f"No preview export in {path}")
    return f"{source.rstrip()}\n\nexport default {name}\n"


def label(slug):
    return " ".join({"ai": "AI", "kbd": "Kbd", "otp": "OTP", "rtl": "RTL", "url": "URL"}.get(word, word.capitalize()) for word in slug.split("-"))


def component_docs(slug):
    return f"https://ui.shadcn.com/docs/components/radix/{slug}"


def registry_url(style, name):
    return f"{REGISTRY}/{style}/{name}.json"


def sample(id, title, source):
    return {"id": id, "label": title, "source": source}


def register_sample(previews, row, path, source):
    vendor_file(path, prefer_default(path, source))
    previews[row["id"]] = path
    return row


def publish_registry(indexes, cache, previews):
    examples = {style: {} for style in STYLES}
    chart_blocks = {family: [] for family in CHART_GROUPS}
    layout_blocks = []
    for style, rows in indexes.items():
        # Skip duplicate layout blocks across the two Radix styles.
        for row in rows:
            type_name = row["type"]
            name = row["name"]
            if style == "radix-nova" and type_name == "registry:block" and not name.startswith("preview"):
                continue
            path = cache / style / f"{name}.json"
            if not path.is_file() or type_name not in (
                "registry:hook", "registry:lib", "registry:ui", "registry:block",
                "registry:example", "registry:internal", "registry:component",
            ):
                continue
            item = json.loads(path.read_text())
            files = item.get("files", [])
            if type_name == "registry:block":
                first = next(file for file in files if file["path"].endswith(".tsx"))
            elif type_name in ("registry:example", "registry:internal"):
                first = files[0]
            else:
                first = None
            for file in files:
                path = file["path"]
                source = file["content"]
                if file is not first:
                    vendor_file(path, source)
                    continue
                record = sample(f"{style}-{name}", row.get("title") or BLOCK_LABELS.get(name, label(name)), registry_url(style, name))
                register_sample(previews, record, path, source)
                if type_name == "registry:block":
                    if name.startswith("chart-"):
                        chart_blocks[name.split("-")[1]].append(record)
                    else:
                        layout_blocks.append(record)
                else:
                    examples[style][name] = record

    for row in ("toast", "toast-demo"):
        item = json.loads((cache / f"{row}.json").read_text())
        for file in item["files"]:
            path = f"registry/legacy/{file['path']}"
            source = file["content"]
            if row == "toast-demo":
                record = sample("legacy-toast-demo", "Toast", registry_url("new-york", "toast-demo"))
                examples["new-york-v4"]["toast-demo"] = register_sample(previews, record, path, source)
            else:
                vendor_file(path, source)
    return examples, layout_blocks, chart_blocks


def publish_docs(cache, installed, examples, previews):
    upstream = cache / "current/apps/v4"
    docs_by_name = {file.stem: file for file in (upstream / "content/docs/components/radix").glob("*.mdx")}
    names = sorted(set(docs_by_name) | installed, key=len, reverse=True)
    sections = {
        name: {
            "id": name,
            "label": label(name),
            "source": component_docs(name) if name in docs_by_name else registry_url("new-york-v4", name),
            "examples": {},
        }
        for name in names
        if name not in ("index",)
    }

    def group_for(name):
        return STANDALONE.get(name) or next((component for component in names if name == component or name.startswith(f"{component}-")), None)

    docs_samples = {}
    ungrouped = []
    for file in sorted((upstream / "examples/radix").glob("*.tsx")):
        path = f"examples-docs/{file.name}"
        title = label(file.stem)
        record = sample(f"docs-{file.stem}", title, f"{REPO}/blob/{CURRENT}/apps/v4/examples/radix/{file.name}")
        docs_samples[file.stem] = register_sample(previews, record, path, file.read_text())

    for component, file in docs_by_name.items():
        for name in re.findall(r'\bname="([^"]+)"', file.read_text()):
            if name in docs_samples:
                sections[component]["examples"][name] = docs_samples[name]
    for name, entry in docs_samples.items():
        component = group_for(name)
        if component in sections:
            sections[component]["examples"].setdefault(name, entry)
        else:
            ungrouped.append(entry)

    for style, rows in examples.items():
        for name, entry in rows.items():
            component = group_for(name)
            if name.startswith("form-"):
                component = "form"
            version = "New York v4" if style == "new-york-v4" else "Radix Nova"
            if component in sections:
                sections[component]["examples"][f"{style}-{name}"] = {**entry, "label": f"{entry['label']} · {version}"}
            else:
                ungrouped.append({**entry, "label": f"{entry['label']} · {version}"})

    for section in sections.values():
        section["examples"] = list(section["examples"].values())
    atoms = [sections[name] for name in ATOMS]
    components = sorted((section for name, section in sections.items() if name not in ATOMS), key=lambda section: section["label"])
    return atoms, components, ungrouped, len(docs_samples)


def publish_apps(cache, previews):
    composition = []
    for folder, base, rev, apps in (
        ("examples-app", "current/apps/v4", CURRENT, CURRENT_APPS),
        ("examples-archive", "legacy/apps/www", ARCHIVE, ARCHIVED_APPS),
    ):
        tree = cache / base / "app/(app)/examples"
        prefix = "app" if folder == "examples-app" else "archive"
        group = []
        for file in sorted(tree.rglob("*")):
            if file.is_file():
                path = f"{folder}/{file.relative_to(tree).as_posix()}"
                vendor_file(path, file.read_text())
        for app in apps:
            id = f"{prefix}-{app.replace('/', '-')}"
            src_path = f"{base.split('/', 1)[1]}/app/(app)/examples/{app}/page.tsx"
            row = sample(id, label(app.replace("/", "-")), f"{REPO}/blob/{rev}/{quote(src_path)}")
            if app.startswith("forms"):
                entry = SOURCE / folder / app / "preview.tsx"
                import_layout = "./layout" if app == "forms" else "../layout"
                entry.write_text(f'import Page from "./page"\nimport Layout from "{import_layout}"\n\nexport default function SettingsPreview() {{\n  return <Layout><Page /></Layout>\n}}\n')
                previews[id] = entry.relative_to(SOURCE).as_posix()
            else:
                previews[id] = f"{folder}/{app}/page.tsx"
            group.append(row)
        composition.append({"id": prefix, "label": "Site examples" if prefix == "app" else "Archived site examples", "examples": group})
    return composition


def publish_support(cache):
    for path in SUPPORT:
        vendor_file(path, (cache / "current/apps/v4" / path).read_text())
    root = cache / "current/apps/v4/registry/bases/radix"
    for directory in root.glob("blocks/preview*"):
        for file in sorted(directory.rglob("*")):
            if file.is_file():
                vendor_file(f"registry/radix-nova/{file.relative_to(root).as_posix()}", file.read_text())
    shutil.copyfile(cache / "LICENSE.md", REVIEW / "LICENSE.shadcn.md")


def publish_public_assets(cache):
    inventories = []
    for revision, prefix, tree_name in (
        (CURRENT, "apps/v4/public", "tree.json"),
        (ARCHIVE, "apps/www/public", "legacy-tree.json"),
    ):
        tree = json.loads((cache / tree_name).read_text())["tree"]
        public = {entry["path"].removeprefix(prefix) for entry in tree if entry["path"].startswith(f"{prefix}/")}
        inventories.append((revision, prefix, public))

    sources = {}
    for vendor in ("registry", "examples-docs", "examples-app", "examples-archive", "components"):
        for file in (SOURCE / vendor).rglob("*"):
            if file.suffix in SOURCE_EXTENSIONS:
                content = file.read_text()
                if ASSET_LITERAL.search(content):
                    sources[file] = content

    assets = sorted({match[2] for content in sources.values() for match in ASSET_LITERAL.finditer(content)})
    for asset in assets:
        match = next(((revision, prefix) for revision, prefix, public in inventories if asset in public), None)
        if match is None:
            raise ValueError(f"No pinned upstream preview asset for {asset}")
        revision, prefix = match
        relative = asset.removeprefix("/")
        url = f"{RAW}/{quote(revision)}/{quote(prefix)}{quote(asset)}"
        target = REVIEW / "public" / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(fetch(url, cache / "public" / relative), target)

    for file, content in sources.items():
        file.write_text(ASSET_LITERAL.sub(lambda match: f"{match[1]}/ui-assets{match[2]}", content))
    return len(assets)


def write_split_catalog(catalog, previews):
    data_root = SOURCE / "catalog-data"
    component_data = data_root / "components"
    composition_data = data_root / "compositions"
    loader_root = SOURCE / "preview-groups"
    for directory, suffix in ((component_data, "*.json"), (composition_data, "*.json"), (loader_root, "*.ts")):
        directory.mkdir(parents=True, exist_ok=True)
        for generated in directory.glob(suffix):
            generated.unlink()

    def summarize(rows, directory):
        groups = []
        for row in rows:
            fields = {name: value for name, value in row.items() if name != "examples"}
            fields["exampleCount"] = len(row["examples"])
            groups.append(fields)
            (directory / f'{row["id"]}.json').write_text(json.dumps(row["examples"], indent=2) + "\n")
        return groups

    summary = {
        "atoms": summarize(catalog["atoms"], component_data),
        "components": summarize(catalog["components"], component_data),
        "compositions": summarize(catalog["compositions"], composition_data),
        "counts": catalog["counts"],
    }
    (SOURCE / "catalog.json").write_text(json.dumps(summary, indent=2) + "\n")

    def group_name(id):
        prefix_words = id.split("-")
        if id.startswith("docs-"):
            return "-".join(prefix_words[:2])
        if id.startswith("new-york-v4-chart-"):
            return "-".join(prefix_words[:5])
        if id.startswith("new-york-v4-"):
            return "-".join(prefix_words[:4])
        if id.startswith("radix-nova-preview"):
            return "radix-nova-preview"
        if id.startswith("radix-nova-"):
            return "radix-nova"
        return prefix_words[0]

    groups = {}
    for id, path in sorted(previews.items()):
        group = group_name(id)
        groups.setdefault(group, []).append(f'  "{id}": () => import("../{path.removesuffix(".tsx")}"),')
    for group, entries in sorted(groups.items()):
        loader = ['// Generated by scripts/import-registry.py.', 'import type { PreviewLoader } from "../preview-loaders"', "", "export const previews: Record<string, PreviewLoader> = {"]
        (loader_root / f"{group}.ts").write_text("\n".join([*loader, *entries, "}\n"]))


def write_catalog(cache, indexes):
    previews = {}
    registry_examples, layout_blocks, chart_blocks = publish_registry(indexes, cache, previews)
    installed = {item["name"] for style in ("new-york-v4", "radix-nova") for item in indexes[style] if item["type"] == "registry:ui"}
    atoms, components, ungrouped, docs_count = publish_docs(cache, installed, registry_examples, previews)
    apps = publish_apps(cache, previews)
    publish_support(cache)
    assets = publish_public_assets(cache)

    layout_blocks.sort(key=lambda row: (not row["id"].endswith("dashboard-01"), row["id"]))
    compositions = [
        {"id": "blocks", "label": "Layout blocks", "examples": layout_blocks},
        *apps,
        *({"id": f"chart-{family}", "label": title, "examples": chart_blocks[family]} for family, title in CHART_GROUPS.items()),
        {"id": "catalog-examples", "label": "Other examples", "examples": ungrouped},
    ]
    counts = {
        "installed": len(installed) + 1,
        "currentRadixInstallables": len([item for item in indexes["radix-nova"] if item["type"] == "registry:ui"]),
        "newYorkInstallables": len([item for item in indexes["new-york-v4"] if item["type"] == "registry:ui"]),
        "documentationExamples": docs_count,
        "newYorkExamplesAndSidebarSnippets": len(registry_examples["new-york-v4"]) - 1,
        "radixNovaRegistryExamples": len(registry_examples["radix-nova"]),
        "layoutBlocks": len(layout_blocks),
        "chartBlocks": sum(map(len, chart_blocks.values())),
        "currentSiteExamples": len(apps[0]["examples"]),
        "archiveSiteExamples": len(apps[1]["examples"]),
        "vendoredPreviewAssets": assets,
    }

    catalog = {"atoms": atoms, "components": components, "compositions": compositions, "counts": counts}
    write_split_catalog(catalog, previews)
    print(json.dumps(counts, indent=2))
    for style in ("new-york-v4", "radix-nova"):
        digest = hashlib.sha256((cache / style / "registry.json").read_bytes()).hexdigest()
        print(f"{style} registry SHA-256 {digest}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, help="Reuse a cache of downloaded official sources")
    args = parser.parse_args()
    if args.cache:
        args.cache.mkdir(parents=True, exist_ok=True)
        write_catalog(args.cache, read_inputs(args.cache))
    else:
        with tempfile.TemporaryDirectory(prefix="doesitarm-shadcn-") as directory:
            cache = Path(directory)
            write_catalog(cache, read_inputs(cache))


if __name__ == "__main__":
    main()

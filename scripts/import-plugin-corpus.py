#!/usr/bin/env python3
"""Import public publisher scan metadata. See docs/audio-plugin-directory.md."""

import argparse
import csv
import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
FORMATS = {"AU": "auv2", "VST2": "vst2", "VST3": "vst3", "CLAP": "clap",
           "AAX": "aax", "APP": "standalone"}
HOST_FORMATS = {value.casefold(): value for value in (*FORMATS.values(), "auv3")}


def read_csv(path):
    with path.open(encoding="utf-8", newline="") as source:
        return list(csv.DictReader(source))


def slugify(value):
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_value.lower().replace("'", "")).strip("-")


def id_for(*parts):
    key = json.dumps(parts, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(key.encode()).hexdigest()[:24]


def https_url(value):
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username:
        raise ValueError(f"Expected a public HTTPS URL: {value!r}")
    return value


def repository_url(url):
    parsed = urlsplit(url)
    if parsed.hostname != "github.com":
        return None
    parts = parsed.path.strip("/").split("/")
    return f"https://github.com/{'/'.join(parts[:2])}" if len(parts) >= 2 else None


def format_verdict(builds):
    states = {build["verdict"] for build in builds}
    if states == {"native", "intel-only"}:
        arm_assets = {build["assetId"] for build in builds if build["verdict"] == "native"}
        intel_assets = {build["assetId"] for build in builds if build["verdict"] == "intel-only"}
        if arm_assets.isdisjoint(intel_assets):
            return "separate-downloads"
    if len(states) == 1:
        return next(iter(states))
    return "mixed"


def binary_verdict(slices, status):
    if status != "complete":
        return "unknown"
    archs = {item["arch"] for item in slices}
    if {"arm64", "x86_64"} <= archs:
        return "universal"
    if "arm64" in archs:
        return "native"
    if "x86_64" in archs and archs <= {"x86_64", "i386", "ppc", "ppc64"}:
        return "intel-only"
    if archs and archs <= {"i386", "ppc", "ppc64"}:
        return "legacy"
    return "unknown"


def unpack_observation(row, checked_on, ledger):
    archive_hash = row["sha256"]
    if not re.fullmatch(r"[a-f0-9]{64}", archive_hash):
        raise ValueError(f"Missing archive digest: {row['name']}")
    if ledger is not None and (archive_hash, row["asset_url"]) not in ledger:
        raise ValueError(f"Observation missing from the scanned package ledger: {row['filename']}")
    source_url = https_url(row["source_url"])
    asset_url = https_url(row["asset_url"])
    filename = unquote(urlsplit(asset_url).path.rsplit("/", 1)[-1])
    asset = {
        "id": id_for(archive_hash, asset_url), "sha256": archive_hash,
        "filename": filename, "sourceUrl": source_url, "url": asset_url
    }

    targets = dict(item.split("=", 1) for item in row["min_macos"].split(";") if item)
    slices = [
        {"arch": arch, "minMacOS": targets.get(arch)} for arch in row["archs"].split(";") if arch
    ]
    member_path = unicodedata.normalize("NFC", row["path"].replace("\\", "/")).removeprefix("./")
    observation = {
        "id": id_for(archive_hash, member_path, row["format"]),
        "assetId": asset["id"], "format": FORMATS[row["format"]],
        "bundleVersion": row["version"] or None, "bundleId": row["bundle_id"] or None,
        "bundleName": row["plist_name"] or None, "observedName": row["name"],
        "memberPath": member_path, "platform": "macOS", "slices": slices,
        "bundleMinMacOS": row["plist_min_macos"] or None, "executableSha256": None,
        "method": "static-publisher-binary-scan", "scanStatus": row["status"],
        "metadataBasis": row["metadata_basis"], "checkedOn": checked_on,
        "verdict": binary_verdict(slices, row["status"]),
    }
    if row["detail"]:
        observation["detail"] = row["detail"]
    return observation, asset


def release_key(row):
    # A publisher tag can cover a suite with several unrelated bundle version strings.
    version_without_tag = row["version"] if not row["release"] else ""
    return row["channel"], row["source_url"], row["release"], version_without_tag


def assemble_releases(product_id, rows):
    grouped = defaultdict(list)
    for row, build in rows:
        grouped[release_key(row)].append(build)
    releases = []
    for (channel, source_url, tag, _), builds in sorted(grouped.items()):
        release_id = id_for(product_id, channel, source_url, tag, _)
        formats = defaultdict(list)
        related = []
        for build in sorted(builds, key=lambda item: (item["format"], item["id"])):
            if build["role"] in {"companion-candidate", "embedded-module"}:
                related.append(build)
            else:
                formats[build["format"], build["bundleVersion"]].append(build)
        releases.append({
            "id": release_id, "channel": channel, "sourceUrl": source_url,
            "releaseLabel": tag or None, "publisherVersion": None,
            "formats": [
                {"format": fmt, "bundleVersion": ver, "verdict": format_verdict(group),
                 "builds": group}
                for (fmt, ver), group in sorted(formats.items(), key=lambda item: (item[0][0], item[0][1] or ""))
            ],
            "relatedObservations": related,
        })
    return releases


def without_scan_dates(value):
    if isinstance(value, dict):
        return {key: without_scan_dates(item) for key, item in value.items()
                if key not in {"checkedOn", "lastModified"}}
    if isinstance(value, list):
        return [without_scan_dates(item) for item in value]
    return value


def make_catalog(rows, identities, checked_on, published_on, ledger=None,
                 popular=(), repositories=(), previous=None):
    plug_in_keys = {(row["vendor"], row["name"]) for row in rows if row["format"] != "APP"}
    repo_index = {row["url"].rstrip("/").lower(): row["url"].rstrip("/") for row in repositories
                  if row["type"] == "Source repository"}
    popularity_names = {(row["vendor"].casefold(), row["name"].casefold()): row["name"]
                        for row in popular}
    aux = {(rule["vendor"], rule["name"], rule["format"], rule["path"]): rule
           for rule in identities["auxiliary"]}
    previous_products = {item["id"]: item for item in (previous or {}).get("products", [])}
    members = defaultdict(list)
    observations_in_review = []
    assets = {}
    seen_ids = set()
    for row in rows:
        vendor, name, fmt = row["vendor"], row["name"], row["format"]
        build, asset = unpack_observation(row, checked_on, ledger)
        if build["id"] in seen_ids:
            raise ValueError(f"Duplicate scan observation: {row['sha256']} {row['path']}")
        seen_ids.add(build["id"])
        assets[asset["id"]] = asset
        auxiliary = aux.get((vendor, name, fmt, row["path"]))
        if auxiliary:
            name = auxiliary["product"]
            build["role"] = "embedded-module"
            build["reviewNote"] = auxiliary["reason"]
        elif fmt == "APP":
            if identities["products"].get(f"{vendor}/{name}", {}).get("standalone"):
                build["role"] = "standalone"
            else:
                build["role"] = "companion-candidate"
        else:
            build["role"] = "plugin-candidate"

        if (vendor, name) in plug_in_keys:
            members[vendor, name].append((row, build))
        else:
            build["observedVendor"] = vendor
            build["reviewNote"] = "App bundle has no same-name plug-in observation"
            observations_in_review.append(build)

    base_slugs = Counter(slugify(identities["products"].get(f"{vendor}/{name}", {}).get("name", name))
                         for vendor, name in members)
    products = []
    vendors = {}
    for (vendor, name), observations in sorted(members.items()):
        review = identities["products"].get(f"{vendor}/{name}", {})
        vendor_review = identities["vendors"].get(vendor, {})
        product_name = review.get("name", name)
        vendor_name = vendor_review.get("name", vendor)
        vendor_id = id_for("vendor", vendor)
        product_id = id_for("product", vendor, name)
        original_slug = slugify(product_name)
        if base_slugs[original_slug] > 1:
            original_slug += f"-{slugify(vendor_name)}"
        slug = review.get("slug", previous_products.get(product_id, {}).get("slug", original_slug))
        if not slug:
            raise ValueError(f"Empty slug for {vendor}/{name}")
        product_rows = [row for row, build in observations if build["role"] == "plugin-candidate"]
        source_urls = {row["source_url"] for row in product_rows}
        projects = {repository_url(url) or url.rstrip("/") for url in source_urls}
        repo_sources = sorted(repo_index.get(url.lower(), url) for url in projects if repository_url(url))
        publisher_url = review.get("url") or next(iter(sorted(projects)))
        vendor_origin = {urlsplit(url).netloc for url in source_urls if not repository_url(url)}
        vendors.setdefault(vendor_id, {
            "id": vendor_id, "name": vendor_name,
            "slug": slugify(vendor), "observedVendor": vendor,
            "url": vendor_review.get("url"),
        })
        if vendors[vendor_id]["url"] is None and len(vendor_origin) == 1:
            vendors[vendor_id]["url"] = f"https://{next(iter(vendor_origin))}"
        release_rows = assemble_releases(product_id, observations)
        review_notes = []
        if len(projects) > 1:
            review_notes.append("The scans point to different publisher projects or product pages.")
        if any(row["metadata_basis"] != "Info.plist" for row in product_rows):
            review_notes.append("Some bundle identities are based on matching filenames.")
        format_ids = defaultdict(set)
        for row in product_rows:
            if row["bundle_id"]:
                format_ids[row["format"]].add(row["bundle_id"].casefold())
        if any(len(ids) > 1 for ids in format_ids.values()):
            review_notes.append("More than one bundle identifier appears within a format.")
        if re.search(r"\bshell\b", name, re.IGNORECASE):
            review_notes.append("Selectable products inside this shell are unconfirmed.")

        discovery_name = next((popularity_names[key] for key in (
            (vendor_name.casefold(), product_name.casefold()),
            (vendor.casefold(), name.casefold())
        ) if key in popularity_names), None)
        product = {
            "id": product_id, "slug": slug, "name": product_name, "vendorId": vendor_id,
            "publisherUrl": https_url(publisher_url), "repositoryUrls": repo_sources,
            "aliases": sorted({alias for alias in (name, discovery_name) if alias and alias != product_name}),
            "lifecycle": "unknown", "role": None, "relatedAppEndpoints": [],
            "identityReview": review_notes,
            "indexable": len(projects) == 1 and not re.search(r"\bshell\b", name, re.IGNORECASE)
            and any(row["status"] == "complete" and row["archs"] for row in product_rows),
            "releases": release_rows,
        }
        original = previous_products.get(product_id, {})
        used_assets = {build["assetId"] for _, build in observations}
        unchanged = without_scan_dates(product) == without_scan_dates(original)
        unchanged &= all((previous or {}).get("assets", {}).get(key) == assets[key] for key in used_assets)
        unchanged &= (previous or {}).get("vendors", {}).get(vendor_id) == vendors[vendor_id]
        product["lastModified"] = original.get("lastModified") if unchanged else published_on
        products.append(product)

    if len({product["slug"] for product in products}) != len(products):
        raise ValueError("Product slugs collide")
    if len({vendor["slug"] for vendor in vendors.values()}) != len(vendors):
        raise ValueError("Vendor slugs collide")
    products.sort(key=lambda product: (product["name"].casefold(), product["slug"]))
    return {
        "schemaVersion": 1, "source": "Public publisher packages from the 2026-11-27 scan corpus",
        "observationCount": len(rows), "provisionalGroupCount": len(plug_in_keys),
        "products": products, "vendors": dict(sorted(vendors.items())),
        "assets": dict(sorted(assets.items())),
        "observationsInReview": sorted(observations_in_review, key=lambda build: build["id"]),
    }


def import_host_matrix(rows):
    rules = []
    for row in rows:
        endpoint = f"/app/{row['host_slug']}"
        if urlsplit(https_url(row["host_url"])).path.rstrip("/") != endpoint:
            raise ValueError(f"Host endpoint mismatch: {endpoint}")
        if row["rule_status"] not in {"documented", "conditional", "hold"}:
            raise ValueError(f"Unexpected host rule status: {row['rule_status']}")
        fmt = HOST_FORMATS.get(row["format"].casefold(), row["format"].casefold())
        rules.append({
            "id": id_for(endpoint, row["format"], row["host_versions"], row["conditions"]),
            "endpoint": endpoint, "hostName": row["host_name"], "format": fmt,
            "roles": row["component_role"].split(";"), "versions": row["host_versions"],
            "loaderScope": row["loader_scope"], "status": row["rule_status"],
            "sourceUrl": https_url(row["source_url"]),
            "supportingSourceUrl": https_url(row["supporting_source_url"]) if row["supporting_source_url"] else None,
            "conditions": row["conditions"], "checkedOn": date.fromisoformat(row["checked_on"]).isoformat(),
        })
    return rules


def write_json(path, value):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("corpus", type=Path, help="Directory containing scanned.csv and discovery tables")
    parser.add_argument("matrix", type=Path)
    parser.add_argument("--checked-on", required=True, type=date.fromisoformat)
    parser.add_argument("--published-on", type=date.fromisoformat, help="Date of substantive changes, if published")
    parser.add_argument("--out", type=Path, default=DATA)
    args = parser.parse_args()

    identities = json.loads((DATA / "plugins/identity.json").read_text())
    destination = args.out / "plugins.json"
    previous = json.loads(destination.read_text()) if destination.exists() else None
    ledger_file = args.corpus / "scripts/package-ledger.csv"
    ledger = {(row["sha256"], row["asset_url"]) for row in read_csv(ledger_file)
              if row["status"] == "scanned"} if ledger_file.exists() else None
    catalog = make_catalog(
        read_csv(args.corpus / "scanned.csv"), identities, args.checked_on.isoformat(),
        args.published_on.isoformat() if args.published_on else None, ledger,
        read_csv(args.corpus / "popular-plugins.csv"), read_csv(args.corpus / "repositories.csv"), previous,
    )
    rules = import_host_matrix(read_csv(args.matrix))
    (args.out / "plugins").mkdir(parents=True, exist_ok=True)
    write_json(destination, catalog)
    write_json(args.out / "plugins/host-capabilities.json", rules)
    print(f"{catalog['observationCount']} observations, {catalog['provisionalGroupCount']} provisional groups, "
          f"{len(catalog['products'])} products, {len(catalog['observationsInReview'])} unmatched app observations")


if __name__ == "__main__":
    main()

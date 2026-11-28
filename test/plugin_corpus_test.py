import importlib.util
import unittest
from pathlib import Path

script = Path(__file__).resolve().parents[1] / "scripts/import-plugin-corpus.py"
spec = importlib.util.spec_from_file_location("plugin_corpus", script)
corpus = importlib.util.module_from_spec(spec)
spec.loader.exec_module(corpus)

IDENTITY = {"vendors": {}, "products": {}, "auxiliary": []}


def scan(name="Example", vendor="Maker", format="VST3", archs="x86_64;arm64",
         package="a", version="1.2.0", bundle_id="org.example"):
    source = "https://github.com/maker/plug/releases/tag/v1.2.0"
    return {
        "name": name, "plist_name": name, "vendor": vendor, "format": format, "archs": archs,
        "version": version, "release": "v1.2.0", "channel": "published", "bundle_id": bundle_id,
        "sha256": package * 64, "min_macos": "arm64=11.0.0;x86_64=10.13.0",
        "plist_min_macos": "10.13", "source_url": source, "asset_url": f"{source}/{package}.zip",
        "metadata_basis": "Info.plist", "status": "complete", "path": f"{name}.{format}",
        "filename": f"{package}.zip", "detail": "",
    }


def catalog(*rows, identities=IDENTITY, previous=None, checked="2026-11-27", published="2026-11-28"):
    return corpus.make_catalog(rows, identities, checked, published, previous=previous)


class PluginCorpusTests(unittest.TestCase):
    def test_exact_vendor_and_name_group_each_format_without_reusing_bundle_ids(self):
        result = catalog(scan(), scan(format="AU", bundle_id="org.example.au"),
                         scan(vendor="Other", package="b"), scan(name="Example 2"))
        self.assertEqual(len(result["products"]), 3)
        self.assertEqual(len({product["slug"] for product in result["products"]}), 3)
        original = next(product for product in result["products"] if product["slug"] == "example-maker")
        au, vst = original["releases"][0]["formats"]
        self.assertEqual((au["format"], au["builds"][0]["bundleId"]), ("auv2", "org.example.au"))
        self.assertEqual((vst["format"], vst["builds"][0]["bundleId"]), ("vst3", "org.example"))
        self.assertEqual(au["builds"][0]["slices"][1], {"arch": "arm64", "minMacOS": "11.0.0"})

    def test_split_assets_and_mixed_formats_keep_individual_slices_and_verdicts(self):
        product, = catalog(scan(format="AU"), scan(archs="arm64"), scan(archs="x86_64", package="b"),
                           scan(format="AAX", archs="x86_64"))["products"]
        result = {group["format"]: group for group in product["releases"][0]["formats"]}
        self.assertEqual(result["auv2"]["verdict"], "universal")
        self.assertEqual(result["aax"]["verdict"], "intel-only")
        self.assertEqual(result["vst3"]["verdict"], "separate-downloads")
        self.assertEqual({build["verdict"] for build in result["vst3"]["builds"]}, {"native", "intel-only"})
        self.assertEqual(corpus.format_verdict([
            {"verdict": "native", "assetId": "same"}, {"verdict": "intel-only", "assetId": "same"}
        ]), "mixed")

    def test_same_package_release_preserves_distinct_or_missing_bundle_versions(self):
        product, = catalog(scan(version="1.2.0"), scan(version="", package="b"))["products"]
        release, = product["releases"]
        self.assertEqual(release["releaseLabel"], "v1.2.0")
        self.assertIsNone(release["publisherVersion"])
        self.assertEqual([group["bundleVersion"] for group in release["formats"]], [None, "1.2.0"])

    def test_companions_and_nested_modules_do_not_expand_public_formats(self):
        nested = scan(name="plugin")
        identities = {**IDENTITY, "auxiliary": [{
            "vendor": "Maker", "name": "plugin", "format": "VST3", "path": nested["path"],
            "product": "Example", "reason": "Embedded module",
        }]}
        result = catalog(scan(format="AU"), nested, scan(format="APP", archs="arm64"),
                         scan(name="Helper", format="APP"), identities=identities)
        product, = result["products"]
        release, = product["releases"]
        self.assertEqual(result["observationCount"], 4)
        self.assertEqual(result["provisionalGroupCount"], 2)
        self.assertEqual([group["format"] for group in release["formats"]], ["auv2"])
        self.assertEqual({build["role"] for build in release["relatedObservations"]},
                         {"embedded-module", "companion-candidate"})
        self.assertEqual(result["observationsInReview"][0]["observedName"], "Helper")

    def test_legacy_and_specialized_slices_are_never_reported_as_modern(self):
        for archs, verdict in [("ppc;i386", "legacy"), ("i386;x86_64", "intel-only"),
                               ("arm64e;x86_64", "unknown"), ("x86_64h", "unknown")]:
            with self.subTest(archs=archs):
                product, = catalog(scan(archs=archs))["products"]
                self.assertEqual(product["releases"][0]["formats"][0]["verdict"], verdict)

    def test_rechecks_preserve_content_date_and_existing_slug(self):
        first = catalog(scan())
        rechecked = catalog(scan(), previous=first, checked="2026-11-29", published="2026-11-30")
        self.assertEqual(rechecked["products"][0]["lastModified"], "2026-11-28")
        with_collision = catalog(scan(), scan(vendor="Other", package="b"), previous=first)
        self.assertIn(first["products"][0]["slug"], {product["slug"] for product in with_collision["products"]})
        changed = catalog(scan(archs="x86_64"), previous=first, published="2026-11-30")
        self.assertEqual(changed["products"][0]["lastModified"], "2026-11-30")


if __name__ == "__main__":
    unittest.main()

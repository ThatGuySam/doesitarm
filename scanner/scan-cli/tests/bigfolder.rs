use scan_core::local_bundle_metadata;
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};
use tempfile::TempDir;

const FIXTURES: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../fixtures");
const THIN: &[u8] = include_bytes!("../../fixtures/thin.macho");
const FAT: &[u8] = include_bytes!("../../fixtures/fat.macho");

fn fixture(case: &str) -> Vec<u8> {
    fs::read(
        Path::new(FIXTURES)
            .join("bigfolder")
            .join(case)
            .join("Info.plist"),
    )
    .unwrap()
}

fn write(path: PathBuf, bytes: &[u8]) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, bytes).unwrap();
}

fn app(root: &Path, name: &str, case: &str) -> PathBuf {
    let path = root.join(name);
    write(path.join("Contents/Info.plist"), &fixture(case));
    path
}

fn scan(path: &Path) -> Value {
    let output = Command::new(env!("CARGO_BIN_EXE_scan-cli"))
        .args(["scan"])
        .arg(path)
        .args(["--profile", "local", "--json"])
        .output()
        .unwrap();
    serde_json::from_slice(&output.stdout)
        .unwrap_or_else(|_| panic!("{}", String::from_utf8_lossy(&output.stderr)))
}

#[test]
fn verifies_a_physical_agentsessions_launcher_with_no_declared_name() {
    let dir = TempDir::new().unwrap();
    let target = app(dir.path(), "AgentSessions.app", "agentsessions-no-key");
    write(target.join("Contents/MacOS/AgentSessions"), FAT);
    let row = scan(&target);
    assert_eq!(row["status"], "complete");
    assert_eq!(row["executable_resolution"], "bundle_name_fallback");
    assert!(row["executable_name"].is_null());
    assert_eq!(row["bundle_id"], "com.triada.AgentSessions");
    assert_eq!(row["version"], "3.8.2");
    assert_eq!(row["min_macos"], "14.0");
    assert_eq!(row["architectures"].as_array().unwrap().len(), 2);
    assert_eq!(row["architectures"][1]["header_verified"], true);
}

#[test]
fn reports_no_executable_without_promoting_an_unrelated_or_non_macho_candidate() {
    let dir = TempDir::new().unwrap();
    let missing_key = app(dir.path(), "Missing Key.app", "missing-executable-key");
    write(missing_key.join("Contents/MacOS/unrelated"), THIN);
    write(
        missing_key.join("Contents/MacOS/Missing Key"),
        b"not a Mach-O",
    );
    let missing_file = app(dir.path(), "Missing File.app", "missing-executable-file");
    let resources = app(dir.path(), "Language Assets.app", "resource-only-bundle");
    write(
        resources.join("Contents/Resources/en.lproj/InfoPlist.strings"),
        b"\"CFBundleName\" = \"Localized\";",
    );
    for (target, role, class) in [
        (missing_key, "app", "missing_executable_key"),
        (missing_file, "app", "missing_executable_file"),
        (resources, "resource_only", "resource_only_bundle"),
    ] {
        let row = scan(&target);
        assert_eq!(row["status"], "no_executable");
        assert_eq!(row["bundle_role"], role);
        assert_eq!(row["error_class"], class);
        assert_eq!(row["architectures"], serde_json::json!([]));
    }
}

#[test]
fn classifies_wrappers_and_flat_nested_apps_by_their_own_evidence() {
    let dir = TempDir::new().unwrap();
    let outer = dir.path().join("Applications/Outer.app");
    let inner = outer.join("Wrapper/Inner.app");
    let binary = fixture("wrapper-nested-flat");
    write(inner.join("Info.plist"), &binary);
    write(inner.join("Inner"), THIN);
    let rows = scan(&dir.path().join("Applications"));
    let rows = rows.as_array().unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0]["bundle_role"], "wrapper");
    assert_eq!(rows[0]["status"], "no_executable");
    assert_eq!(rows[1]["bundle_role"], "nested_app");
    assert_eq!(rows[1]["status"], "complete");
    assert_eq!(rows[1]["parent_bundle_path"], "Applications/Outer.app");
    assert_eq!(
        rows[1]["executable_path"],
        "Applications/Outer.app/Wrapper/Inner.app/Inner"
    );
    let evidence = serde_json::to_value(local_bundle_metadata(
        &binary,
        "Inner.app",
        "Info.plist",
        true,
        "",
    ))
    .unwrap();
    assert_eq!(evidence["info_plist_encoding"], "binary");
    assert_eq!(
        evidence["info_plist"]["Nested"]["integer"]["value"],
        "18446744073709551615"
    );
    assert_eq!(evidence["info_plist"]["Nested"]["data"]["value"], "616263");
}

#[test]
fn supports_xml_bom_and_contents_relative_launcher() {
    let dir = TempDir::new().unwrap();
    let target = app(dir.path(), "BOM.app", "contents-relative-bom");
    write(target.join("Contents/Tools/Launch"), THIN);
    let row = scan(&target);
    assert_eq!(row["status"], "complete");
    assert_eq!(row["executable_path"], "BOM.app/Contents/Tools/Launch");
    let metadata = local_bundle_metadata(
        &fixture("contents-relative-bom"),
        "BOM.app",
        "Contents/Info.plist",
        false,
        "",
    );
    assert_eq!(metadata.info_plist_encoding, "xml_bom");
}

#[test]
fn identifies_a_declared_script_without_any_macho_architecture() {
    let dir = TempDir::new().unwrap();
    let target = app(dir.path(), "Script.app", "script-launcher");
    write(target.join("Contents/MacOS/Launch"), b"#!/bin/sh\nexit 0\n");
    let row = scan(&target);
    assert_eq!(row["status"], "script");
    assert_eq!(row["architectures"], serde_json::json!([]));
    assert_eq!(row["error_class"], "executable_is_script");
}

#[test]
fn scans_other_macos_binaries_without_repeating_the_bundle_launcher() {
    let dir = TempDir::new().unwrap();
    let root = dir.path().join("Applications");
    let target = app(&root, "Multiple Binaries.app", "secondary-macos-binary");
    write(target.join("Contents/MacOS/Launch"), FAT);
    write(target.join("Contents/MacOS/helper tool"), THIN);
    let rows = scan(&root);
    let rows = rows.as_array().unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0]["status"], "complete");
    assert_eq!(rows[1]["format"], "macho");
    assert_eq!(rows[1]["status"], "complete");
    assert_eq!(rows[1]["parent_bundle_path"], rows[0]["display_path"]);
    assert_eq!(
        rows[1]["display_path"],
        "Applications/Multiple Binaries.app/Contents/MacOS/helper tool"
    );
}

#[test]
fn an_archive_named_as_the_launcher_cannot_supply_the_app_architecture() {
    let dir = TempDir::new().unwrap();
    let target = app(dir.path(), "Archive Launcher.app", "archive-as-executable");
    write(
        target.join("Contents/MacOS/Launch"),
        include_bytes!("../../fixtures/stored.zip"),
    );
    let row = scan(&target);
    assert_eq!(row["status"], "invalid");
    assert_eq!(row["error_class"], "executable_not_macho");
    assert_eq!(row["architectures"], serde_json::json!([]));
}

#[cfg(unix)]
#[test]
fn skips_directory_symlink_loops_and_duplicate_bundle_aliases() {
    let dir = TempDir::new().unwrap();
    let root = dir.path().join("Applications");
    let target = app(&root, "Real.app", "symlink-loop");
    write(target.join("Contents/MacOS/Real"), THIN);
    std::os::unix::fs::symlink(".", root.join("Loop")).unwrap();
    std::os::unix::fs::symlink("Real.app", root.join("Alias.app")).unwrap();
    let rows = scan(&root);
    let rows = rows.as_array().unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0]["display_path"], "Applications/Real.app");
    assert_eq!(rows[0]["status"], "complete");
}

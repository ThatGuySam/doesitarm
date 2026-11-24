use scan_core::{ReadAt, Result, ScanError, ScanResult, Status, Target, scan, scan_target};
use std::{
    future::Future,
    pin::pin,
    task::{Context, Poll, Waker},
};

struct Memory<'a>(&'a [u8]);

impl ReadAt for Memory<'_> {
    fn size(&self) -> u64 {
        self.0.len() as u64
    }
    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>> {
        self.0
            .get(offset as usize..offset as usize + len)
            .map(<[u8]>::to_vec)
            .ok_or(ScanError::Invalid("fixture range"))
    }
}

fn ready<T>(f: impl Future<Output = T>) -> T {
    match pin!(f).poll(&mut Context::from_waker(Waker::noop())) {
        Poll::Ready(value) => value,
        Poll::Pending => panic!("in-memory I/O must be immediately ready"),
    }
}

fn run(data: &[u8], budget: u64) -> ScanResult {
    ready(scan(&mut Memory(data), budget))
}

const THIN: &[u8] = include_bytes!("../../fixtures/thin.macho");
const FAT: &[u8] = include_bytes!("../../fixtures/fat.macho");
const FAT64: &[u8] = include_bytes!("../../fixtures/fat64.macho");

#[test]
fn thin_reports_architecture_minimum_and_signature_presence() {
    let result = run(THIN, u64::MAX);
    assert!(matches!(result.status, Status::Complete));
    assert_eq!(result.format, Some("macho"));
    assert_eq!(result.total_size, THIN.len() as u64);
    let arm = &result.architectures[0];
    assert_eq!(arm.name, "arm64e");
    assert!(arm.header_verified);
    assert_eq!(arm.min_macos.as_deref(), Some("13.1"));
    assert_eq!(arm.code_signature_present, Some(true));
}

#[test]
fn fat32_and_fat64_seek_to_thin_headers_in_file_order() {
    for input in [FAT, FAT64] {
        let result = run(input, u64::MAX);
        assert!(matches!(result.status, Status::Complete));
        let intel = &result.architectures[0];
        assert_eq!(intel.name, "x86_64");
        assert_eq!(intel.min_macos.as_deref(), Some("10.15.7"));
        assert_eq!(intel.code_signature_present, Some(false));
        assert_eq!(result.architectures[1].name, "arm64e");
        assert!(result.bytes_read < result.total_size / 4);
        assert_eq!(result.reads, 9);
    }
}

#[test]
fn budget_preserves_fat_table_architectures_and_accounts_for_reads() {
    let result = run(FAT, 52);
    assert!(matches!(result.status, Status::BudgetExhausted));
    assert_eq!(result.bytes_read, 52);
    assert_eq!(result.reads, 3);
    assert_eq!(result.architectures.len(), 2);
    assert!(
        result
            .architectures
            .iter()
            .all(|arch| !arch.header_verified)
    );
}

#[test]
fn refuses_out_of_bounds_fat_slice() {
    let result = run(&FAT[..1040], u64::MAX);
    assert!(matches!(result.status, Status::Invalid));
    assert!(result.architectures.is_empty());
}

const ZIP: &[u8] = include_bytes!("../../fixtures/stored.zip");
const ZIP64: &[u8] = include_bytes!("../../fixtures/deflated-zip64.zip");

fn assert_bundle(result: &ScanResult) {
    assert!(matches!(result.status, Status::Complete), "{result:?}");
    assert_eq!(result.bundle_id.as_deref(), Some("org.doesitarm.fixture"));
    assert_eq!(result.bundle_path.as_deref(), Some("Fixture.app"));
    assert_eq!(result.version.as_deref(), Some("4.2"));
    assert_eq!(result.name.as_deref(), Some("Scanner Fixture"));
    assert_eq!(result.min_macos.as_deref(), Some("11.0"));
    assert_eq!(result.executable_name.as_deref(), Some("FixtureBinary"));
    assert_eq!(result.executable_size, Some(FAT.len() as u64));
    assert_eq!(result.architectures[0].name, "x86_64");
    assert_eq!(result.architectures[1].name, "arm64e");
    assert!(result.architectures.iter().all(|arch| arch.header_verified));
}

#[test]
fn stored_zip_seeks_to_bundle_executable() {
    let result = run(ZIP, u64::MAX);
    assert_eq!(result.format, Some("zip"));
    assert_bundle(&result);
    assert!(result.bytes_read < result.total_size * 3 / 4);
}

#[test]
fn declared_targets_verify_named_bundles_and_binaries() {
    for artifact in [
        ZIP,
        include_bytes!("../../fixtures/app.tar.gz"),
        include_bytes!("../../fixtures/hfsx.dmg"),
        include_bytes!("../../fixtures/apfs.dmg"),
        include_bytes!("../../fixtures/gzip-newc.pkg"),
    ] {
        let result = ready(scan_target(
            &mut Memory(artifact),
            u64::MAX,
            Target::Bundle("Fixture.app"),
        ));
        assert!(matches!(result.status, Status::Complete), "{result:?}");
        assert_eq!(result.bundle_id.as_deref(), Some("org.doesitarm.fixture"));
        let path = "Fixture.app/Contents/MacOS/FixtureBinary";
        let binary = ready(scan_target(
            &mut Memory(artifact),
            u64::MAX,
            Target::Executable(path),
        ));
        assert!(matches!(binary.status, Status::Complete), "{binary:?}");
        assert_eq!(binary.executable_path.as_deref(), Some(path));
        assert!(binary.bundle_id.is_none());
        assert_eq!(binary.architectures.len(), 2);
    }
    let missing = ready(scan_target(
        &mut Memory(ZIP),
        u64::MAX,
        Target::Bundle("Different.app"),
    ));
    assert!(matches!(missing.status, Status::NotFound));
}

#[test]
fn nested_packages_and_images_keep_the_outer_format_and_named_app() {
    for (format, inside, artifact) in [
        (
            "dmg",
            "Fixture.pkg",
            include_bytes!("../../fixtures/nested-pkg.dmg").as_slice(),
        ),
        (
            "pkg",
            "Component.pkg",
            include_bytes!("../../fixtures/nested-flat.pkg").as_slice(),
        ),
        (
            "zip",
            "Wrapper/Fixture.dmg",
            include_bytes!("../../fixtures/nested-dmg.zip").as_slice(),
        ),
        (
            "zip",
            "Fixture.pkg/Contents/Archive.pax.gz",
            include_bytes!("../../fixtures/nested-legacy.zip").as_slice(),
        ),
    ] {
        let result = ready(scan_target(
            &mut Memory(artifact),
            1024 * 1024,
            Target::Bundle("Fixture.app"),
        ));
        assert!(matches!(result.status, Status::Complete), "{result:?}");
        assert_eq!(result.format, Some(format));
        assert_eq!(result.bundle_id.as_deref(), Some("org.doesitarm.fixture"));
        assert_eq!(result.nested_artifacts, [inside]);
        assert_eq!(result.architectures.len(), 2);
    }
}

#[test]
fn installer_distribution_exposes_a_remote_component_without_scanning_it() {
    let artifact = include_bytes!("../../fixtures/remote-component.xar");
    let result = run(artifact, u64::MAX);
    assert!(matches!(result.status, Status::Unsupported));
    assert_eq!(
        result.error.as_deref(),
        Some("unsupported: installer Distribution references remote package components")
    );
    assert_eq!(
        result.installer.unwrap().remote_components,
        ["https://example.invalid/component.pkg"]
    );
    assert!(result.architectures.is_empty());
}

#[test]
fn zip_supports_bzip2_and_zip_framed_lzma_members() {
    for artifact in [
        include_bytes!("../../fixtures/bzip2.zip").as_slice(),
        include_bytes!("../../fixtures/lzma.zip").as_slice(),
    ] {
        let result = run(artifact, 64 * 1024);
        assert_eq!(result.format, Some("zip"));
        assert_bundle(&result);
    }
}

#[test]
fn zip64_with_comment_reads_binary_plist_and_deflated_executable() {
    let result = run(ZIP64, ZIP64.len() as u64 - 1);
    assert_eq!(result.format, Some("zip"));
    assert_bundle(&result);
    assert!(result.bytes_read < result.total_size);
}

#[test]
fn zip_budget_preserves_bundle_fields_before_executable() {
    let full = run(ZIP, u64::MAX);
    let result = run(ZIP, full.bytes_read - 48);
    assert!(matches!(result.status, Status::BudgetExhausted));
    assert_eq!(result.bundle_id, full.bundle_id);
    assert_eq!(result.executable_name, full.executable_name);
    assert!(result.bytes_read <= full.bytes_read - 48);
}

const TAR: &[u8] = include_bytes!("../../fixtures/app.tar.gz");
const TAR_REVERSED: &[u8] = include_bytes!("../../fixtures/app-binary-first.tar.gz");

#[test]
fn tar_walks_plain_bzip2_and_xz_headers() {
    for (format, artifact) in [
        ("tar", include_bytes!("../../fixtures/app.tar").as_slice()),
        (
            "tar.bz2",
            include_bytes!("../../fixtures/app.tar.bz2").as_slice(),
        ),
        (
            "tar.xz",
            include_bytes!("../../fixtures/app.tar.xz").as_slice(),
        ),
    ] {
        let result = run(artifact, 8 * 1024);
        assert_eq!(result.format, Some(format));
        assert_bundle(&result);
    }
}

#[test]
fn pkg_recovers_bom_checked_late_plist_and_scans_the_named_binary() {
    let artifact = include_bytes!("../../fixtures/late-bom.pkg");
    let budget = 600 * 1024;
    let result = run(artifact, budget);
    assert_bundle(&result);
    assert_eq!(
        result.bundle_metadata_source,
        Some("bom_verified_gzip_cpio_tail")
    );
    assert!(result.bytes_read < budget);

    let mut changed = artifact.to_vec();
    let identifier = b"org.doesitarm.fixture</string>";
    let at = changed
        .windows(identifier.len())
        .position(|window| window == identifier)
        .unwrap();
    changed[at] = b'x';
    let rejected = run(&changed, budget);
    assert!(matches!(rejected.status, Status::BudgetExhausted));
    assert!(rejected.bundle_id.is_none());
    assert!(rejected.bundle_metadata_source.is_none());
}

#[test]
fn tar_stops_after_plist_and_exact_executable() {
    let result = run(TAR, u64::MAX);
    assert_eq!(result.format, Some("tar.gz"));
    assert_bundle(&result);
    assert!(result.total_size > result.bytes_read);
    assert_eq!(result.reads, 2);
}

#[test]
fn tar_reuses_earlier_executable_evidence_after_pax_path_and_plist() {
    let result = run(TAR_REVERSED, 2048);
    assert!(matches!(result.status, Status::Complete), "{result:?}");
    assert!(
        result
            .bundle_path
            .as_deref()
            .unwrap()
            .ends_with("/Fixture.app")
    );
    assert_eq!(result.bundle_id.as_deref(), Some("org.doesitarm.fixture"));
    assert_eq!(result.architectures.len(), 2);
    assert_eq!(result.architectures[1].name, "arm64e");
    assert!(result.bytes_read <= 2048);
}

#[test]
fn tar_reports_budget_exhaustion_if_compressed_prefix_is_too_short() {
    let result = run(TAR, 80);
    assert!(matches!(result.status, Status::BudgetExhausted));
    assert_eq!(result.bytes_read, 80);
    assert_eq!(result.format, Some("tar.gz"));
}

const DMG: &[u8] = include_bytes!("../../fixtures/hfsx.dmg");

#[test]
fn dmg_uses_hfsx_catalog_and_overflow_extents_across_udif_codecs() {
    let result = run(DMG, u64::MAX);
    assert_eq!(result.format, Some("dmg"));
    assert!(matches!(result.status, Status::Complete), "{result:?}");
    assert_eq!(result.bundle_id.as_deref(), Some("org.doesitarm.fixture"));
    assert_eq!(result.executable_name.as_deref(), Some("FixtureBinary"));
    assert_eq!(result.executable_size, Some(4096 + 48));
    assert_eq!(result.architectures[0].offset, 4096);
    assert_eq!(result.architectures[0].name, "x86_64");
    assert_eq!(result.architectures[1].name, "arm64e");
    assert!(result.architectures.iter().all(|arch| arch.header_verified));
    assert!(result.bytes_read < result.total_size / 4);
}

#[test]
fn dmg_footer_wins_over_first_bzip2_chunk_magic() {
    let image = include_bytes!("../../fixtures/bzip2-prefix.dmg");
    assert!(image.starts_with(b"BZh"));
    let result = run(image, 1024 * 1024);
    assert!(matches!(result.status, Status::Complete), "{result:?}");
    assert_eq!(result.format, Some("dmg"));
    assert_eq!(result.bundle_id.as_deref(), Some("org.doesitarm.fixture"));
}

#[test]
fn dmg_rejects_segmented_udif() {
    let mut data = DMG.to_vec();
    let segment_count = data.len() - 512 + 60;
    data[segment_count + 3] = 2;
    let result = run(&data, u64::MAX);
    assert_eq!(result.format, Some("dmg"));
    assert!(matches!(result.status, Status::Unsupported));
    assert_eq!(result.reads, 2);
}

const PKG: &[u8] = include_bytes!("../../fixtures/gzip-newc.pkg");
const PKG_ODC: &[u8] = include_bytes!("../../fixtures/stored-odc.pkg");

#[test]
fn pkg_reads_installer_metadata_and_gzip_or_stored_cpio() {
    for data in [PKG, PKG_ODC] {
        let scanned = run(data, u64::MAX);
        assert_eq!(scanned.format, Some("pkg"));
        assert_bundle(&scanned);
        let meta = scanned.installer.unwrap();
        assert_eq!(meta.title.as_deref(), Some("Fixture Installer"));
        assert_eq!(meta.host_architectures, ["x86_64", "arm64"]);
        assert_eq!(
            meta.package_id.as_deref(),
            Some("org.doesitarm.fixture-installer")
        );
        assert_eq!(meta.package_version.as_deref(), Some("5"));
        assert_eq!(meta.min_macos.as_deref(), Some("11.0"));
    }
}

#[test]
fn pkg_returns_installer_metadata_when_payload_budget_runs_out() {
    let result = run(PKG, 550);
    assert!(
        matches!(result.status, Status::BudgetExhausted),
        "{result:?}"
    );
    let info = result.installer.unwrap();
    assert_eq!(info.host_architectures, ["x86_64", "arm64"]);
    assert!(result.architectures.is_empty());
}

const APFS: &[u8] = include_bytes!("../../fixtures/apfs.dmg");

#[test]
fn apfs_dmg_uses_latest_checkpoint_and_seeks_through_file_extents() {
    let result = run(APFS, u64::MAX);
    assert!(matches!(result.status, Status::Complete), "{result:?}");
    assert_eq!(result.format, Some("dmg"));
    assert_eq!(result.bundle_id.as_deref(), Some("org.doesitarm.fixture"));
    assert_eq!(result.executable_size, Some(4096 + 48));
    assert_eq!(result.architectures[0].offset, 4096);
    assert_eq!(result.architectures[1].name, "arm64e");
    assert!(result.architectures.iter().all(|arch| arch.header_verified));
    assert!(result.bytes_read < result.total_size / 10);
}

const PBZX: &[u8] = include_bytes!("../../fixtures/pbzx.pkg");

#[test]
fn pbzx_pkg_skips_unneeded_chunks_and_reads_a_mixed_raw_and_xz_payload() {
    let result = run(PBZX, 8192);
    assert_bundle(&result);
    assert!(result.bytes_read < result.total_size / 2);
}

#[test]
fn budget_preserves_an_unconfirmed_executable_candidate_before_the_plist() {
    let mut evidence = None;
    for budget in 100..2048 {
        let result = run(TAR_REVERSED, budget);
        if matches!(result.status, Status::BudgetExhausted)
            && result
                .candidate_executables
                .iter()
                .any(|exe| !exe.architectures.is_empty())
        {
            evidence = Some(result);
            break;
        }
    }
    let result =
        evidence.expect("a compressed prefix that reaches the candidate but not the plist");
    assert!(result.architectures.is_empty());
    assert!(result.bundle_id.is_none());
    assert!(
        result.candidate_executables[0]
            .path
            .ends_with("/Contents/MacOS/FixtureBinary")
    );
}

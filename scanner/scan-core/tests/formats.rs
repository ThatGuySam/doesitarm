use scan_core::{
    Profile, ReadAt, Result, ScanError, ScanLimits, ScanResult, Status, Target, scan, scan_target,
    scan_target_with_deadline, scan_with_limits,
};
use std::{
    future::Future,
    io::{Read, Write},
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

struct Sparse<'a> {
    size: u64,
    spans: Vec<(u64, &'a [u8])>,
}

impl ReadAt for Sparse<'_> {
    fn size(&self) -> u64 {
        self.size
    }

    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>> {
        let end = offset + len as u64;
        if end > self.size {
            return Err(ScanError::Invalid("sparse fixture range"));
        }
        let mut bytes = vec![0; len];
        for (start, data) in &self.spans {
            let first = (*start).max(offset);
            let last = (*start + data.len() as u64).min(end);
            if first < last {
                bytes[(first - offset) as usize..(last - offset) as usize]
                    .copy_from_slice(&data[(first - start) as usize..(last - start) as usize]);
            }
        }
        Ok(bytes)
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
    assert_eq!(result.bytes_requested, 52);
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
fn repeated_magic_probe_counts_once_in_unique_bytes() {
    let result = run(FAT, 52);
    assert_eq!(result.bytes_read, 48);
}

#[test]
fn bundle_rejects_deep_xml_and_binary_plist_collections() {
    let mut dictionary = plist::Dictionary::new();
    dictionary.insert("CFBundleExecutable".into(), "FixtureBinary".into());
    let mut nested = plist::Value::Boolean(true);
    for _ in 0..65 {
        nested = plist::Value::Array(vec![nested]);
    }
    dictionary.insert("NestedMetadata".into(), nested);
    let value = plist::Value::Dictionary(dictionary);
    let mut xml = Vec::new();
    let mut binary = Vec::new();
    value.to_writer_xml(&mut xml).unwrap();
    value.to_writer_binary(&mut binary).unwrap();

    for bytes in [&xml, &binary] {
        let result = scan_core::bundle_metadata(bytes, "Fixture.app");
        assert!(matches!(result.status, Status::Invalid), "{result:?}");
        assert!(result.error.unwrap().contains("nesting"));
    }
}

#[test]
fn dmg_rejects_deep_udif_plist_index() {
    let mut index = String::from("<plist><dict><key>extra</key>");
    index.push_str(&"<array>".repeat(65));
    index.push_str(&"</array>".repeat(65));
    index.push_str("</dict></plist>");
    let mut trailer = [0; 512];
    trailer[..12].copy_from_slice(b"koly\0\0\0\x04\0\0\x02\0");
    trailer[224..232].copy_from_slice(&(index.len() as u64).to_be_bytes());
    let mut image = index.into_bytes();
    image.extend_from_slice(&trailer);
    let result = run(&image, u64::MAX);
    assert_eq!(result.format, Some("dmg"));
    assert!(matches!(result.status, Status::Invalid), "{result:?}");
    assert!(result.error.unwrap().contains("nesting"));
}

#[test]
fn refuses_out_of_bounds_fat_slice() {
    let result = run(&FAT[..1040], u64::MAX);
    assert!(matches!(result.status, Status::Invalid));
    assert!(result.architectures.is_empty());
}

const ZIP: &[u8] = include_bytes!("../../fixtures/stored.zip");
const ZIP64: &[u8] = include_bytes!("../../fixtures/deflated-zip64.zip");

#[test]
fn zip_recovers_a_wrapped_directory_and_individual_member_offsets() {
    const WRAP: u64 = 1 << 32;
    let number = |bytes: &[u8]| u32::from_le_bytes(bytes.try_into().unwrap()) as usize;
    let short = |bytes: &[u8]| u16::from_le_bytes(bytes.try_into().unwrap()) as usize;
    let end = ZIP.len() - 22;
    let directory = number(&ZIP[end + 16..end + 20]);
    let name = b"Fixture.app/Contents/Info.plist";
    let record = ZIP[directory..end]
        .windows(46 + name.len())
        .find(|bytes| bytes.starts_with(b"PK\x01\x02") && &bytes[46..] == name)
        .unwrap();
    let plist_at = number(&record[42..46]);
    let local = &ZIP[plist_at..];
    let plist_end =
        plist_at + 30 + short(&local[26..28]) + short(&local[28..30]) + number(&record[20..24]);
    // Leave the launcher below 4 GiB. Only the plist and directory wrap.
    let mut source = Sparse {
        size: WRAP + ZIP.len() as u64,
        spans: vec![
            (0, &ZIP[..plist_at]),
            (plist_end as u64, &ZIP[plist_end..directory]),
            (WRAP + plist_at as u64, &ZIP[plist_at..plist_end]),
            (WRAP + directory as u64, &ZIP[directory..]),
        ],
    };
    let result = ready(scan(&mut source, 16 * 1024));
    assert!(matches!(result.status, Status::Complete), "{result:?}");
    assert_bundle(&result);
    assert!(result.bytes_read < 2048);
}

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
    let result = run(ZIP, full.bytes_requested - 48);
    assert!(matches!(result.status, Status::BudgetExhausted));
    assert_eq!(result.bundle_id, full.bundle_id);
    assert_eq!(result.executable_name, full.executable_name);
    assert!(result.bytes_requested <= full.bytes_requested - 48);
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
fn tar_keeps_the_main_when_inventory_reaches_the_byte_budget() {
    let result = run(TAR, 68 * 1024);
    assert_eq!(result.format, Some("tar.gz"));
    assert_bundle(&result);
    assert!(result.total_size > result.bytes_read);
    assert!(!result.inventory.as_ref().unwrap().complete);
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
    assert_eq!(result.bytes_read, 76);
    assert_eq!(result.bytes_requested, 80);
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
fn dmg_with_zero_footer_sector_count_uses_block_map_geometry() {
    let mut image = include_bytes!("../../fixtures/bzip2-prefix.dmg").to_vec();
    let footer = image.len() - 512;
    image[footer + 492..footer + 500].fill(0);
    for profile in [Profile::Local, Profile::RemoteCli, Profile::Worker] {
        let result = ready(scan_with_limits(
            &mut Memory(&image),
            ScanLimits::for_profile(profile),
        ));
        assert!(matches!(result.status, Status::Complete), "{result:?}");
        assert_eq!(result.bundle_id.as_deref(), Some("org.doesitarm.fixture"));
        assert!(result.architectures.iter().all(|arch| arch.header_verified));
    }
}

#[test]
fn dmg_verifies_the_bundle_named_by_rock_ridge_records() {
    let image = include_bytes!("../../fixtures/rock-ridge.dmg");
    for profile in [Profile::Local, Profile::RemoteCli, Profile::Worker] {
        let result = ready(scan_with_limits(
            &mut Memory(image),
            ScanLimits::for_profile(profile),
        ));
        assert!(matches!(result.status, Status::Complete), "{result:?}");
        assert_eq!(result.format, Some("dmg"));
        assert_eq!(result.bundle_path.as_deref(), Some("Fixture.app"));
        assert_bundle(&result);
    }
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

#[test]
fn identifies_encrypted_apple_disk_images_by_header_or_trailer() {
    let mut modern = [0; 4096];
    modern[..12].copy_from_slice(b"encrcdsa\0\0\0\x02");
    let mut legacy = [0; 4096];
    legacy[4088..].copy_from_slice(b"cdsaencr");
    for image in [&modern, &legacy] {
        let result = run(image, 8192);
        assert_eq!(result.format, Some("dmg"));
        assert!(matches!(result.status, Status::Unsupported), "{result:?}");
        assert_eq!(
            result.error.as_deref(),
            Some("unsupported: encrypted Apple disk image")
        );
        assert!(result.architectures.is_empty());
    }
}

#[test]
fn sparse_image_seeks_hfs_through_unordered_bands_and_an_apple_partition_map() {
    let image = include_bytes!("../../fixtures/apm.sparseimage");
    for profile in [Profile::Local, Profile::RemoteCli, Profile::Worker] {
        let result = ready(scan_with_limits(
            &mut Memory(image),
            ScanLimits::for_profile(profile),
        ));
        assert!(matches!(result.status, Status::Complete), "{result:?}");
        assert_eq!(result.format, Some("dmg"));
        assert_eq!(result.bundle_path.as_deref(), Some("Fixture.app"));
        assert_eq!(result.executable_size, Some(4144));
        assert_eq!(result.architectures.len(), 2);
        assert!(result.architectures.iter().all(|arch| arch.header_verified));
        assert!(result.bytes_read < result.total_size / 2);
    }
}

#[test]
fn hfs_auto_finds_an_app_in_the_single_visible_root_directory() {
    let image = include_bytes!("../../fixtures/wrapped-hfs.dmg");
    for profile in [Profile::Local, Profile::RemoteCli, Profile::Worker] {
        let result = ready(scan_with_limits(
            &mut Memory(image),
            ScanLimits::for_profile(profile),
        ));
        assert!(matches!(result.status, Status::Complete), "{result:?}");
        assert_eq!(result.bundle_path.as_deref(), Some("Suite/Fixture.app"));
        assert_eq!(result.bundle_id.as_deref(), Some("org.doesitarm.fixture"));
        assert_eq!(result.architectures.len(), 2);
        assert!(result.architectures.iter().all(|arch| arch.header_verified));
    }
}

#[test]
fn hfs_selects_the_declared_app_across_install_and_remove_packages() {
    let image = include_bytes!("../../fixtures/install-remove.dmg");
    for profile in [Profile::Local, Profile::RemoteCli, Profile::Worker] {
        let result = ready(scan_with_limits(
            &mut Memory(image),
            ScanLimits::for_profile(profile),
        ));
        assert!(matches!(result.status, Status::Complete), "{result:?}");
        assert_eq!(
            result.bundle_path.as_deref(),
            Some("Applications/Fixture.app")
        );
        assert_eq!(result.nested_artifacts, ["Install.pkg"]);
        assert_eq!(result.architectures.len(), 2);
        assert!(result.architectures.iter().all(|arch| arch.header_verified));
    }
}

#[test]
fn hfs_preserves_ambiguity_when_two_packages_contain_apps() {
    let image = include_bytes!("../../fixtures/competing-packages.dmg");
    let result = run(image, 8192);
    assert!(matches!(result.status, Status::Unsupported), "{result:?}");
    assert_eq!(
        result.error.as_deref(),
        Some("unsupported: multiple nested PKGs in HFS volume")
    );
    assert_eq!(result.nested_artifacts, ["Install.pkg", "Other.pkg"]);
    assert!(result.bundle_path.is_none());
    assert!(result.architectures.is_empty());
}

#[test]
fn hfs_finds_a_declared_executable_inside_the_package() {
    let image = include_bytes!("../../fixtures/nested-pkg.dmg");
    let path = "Fixture.app/Contents/MacOS/FixtureBinary";
    let result = ready(scan_target(
        &mut Memory(image),
        8192,
        Target::Executable(path),
    ));
    assert!(matches!(result.status, Status::Complete), "{result:?}");
    assert_eq!(result.executable_path.as_deref(), Some(path));
    assert_eq!(result.nested_artifacts, ["Fixture.pkg"]);
    assert_eq!(result.architectures.len(), 2);
    assert!(result.architectures.iter().all(|arch| arch.header_verified));
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
fn pkg_auto_selects_the_product_in_packageinfo_bundle_version() {
    let package = include_bytes!("../../fixtures/product-bundle-version.pkg");
    let result = run(package, 8192);
    assert!(matches!(result.status, Status::Complete), "{result:?}");
    let path = "Library/Audio/Plug-Ins/VST3/Fixture.vst3";
    assert_eq!(result.bundle_kind, Some("audio_plugin"));
    assert_eq!(result.bundle_path.as_deref(), Some(path));
    assert_eq!(result.installer.unwrap().payload_bundles, [path]);
    assert_eq!(result.architectures.len(), 2);
    assert!(result.architectures.iter().all(|arch| arch.header_verified));
}

#[test]
fn pkg_mounts_contents_relative_payload_in_the_declared_plugin() {
    let zip = include_bytes!("../../fixtures/mounted-plugin.zip");
    for profile in [Profile::Local, Profile::RemoteCli, Profile::Worker] {
        let result = ready(scan_with_limits(
            &mut Memory(zip),
            ScanLimits::for_profile(profile),
        ));
        assert!(matches!(result.status, Status::Complete), "{result:?}");
        assert_eq!(result.format, Some("zip"));
        assert_eq!(result.nested_artifacts, ["Fixture.pkg"]);
        assert_eq!(result.bundle_kind, Some("audio_plugin"));
        assert_eq!(
            result.bundle_path.as_deref(),
            Some("Library/Application Support/Avid/Audio/Plug-Ins/Fixture.aaxplugin")
        );
        assert_eq!(result.architectures.len(), 2);
        assert!(result.architectures.iter().all(|arch| arch.header_verified));
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

#[test]
fn apfs_dmg_verifies_macho_slices_in_lzvn_resource_fork_chunks() {
    let image = include_bytes!("../../fixtures/apfs-lzvn.dmg");
    for profile in [Profile::Local, Profile::RemoteCli, Profile::Worker] {
        let result = ready(scan_with_limits(
            &mut Memory(image),
            ScanLimits::for_profile(profile),
        ));
        assert!(matches!(result.status, Status::Complete), "{result:?}");
        assert_eq!(result.bundle_id.as_deref(), Some("org.doesitarm.fixture"));
        assert_eq!(result.executable_size, Some(65_536 + 48));
        assert_eq!(result.architectures[0].offset, 65_536);
        assert_eq!(result.architectures[0].name, "x86_64");
        assert_eq!(result.architectures[1].name, "arm64e");
        assert!(result.architectures.iter().all(|arch| arch.header_verified));
        assert!(result.bytes_read < result.total_size / 10);
    }
}

const PBZX: &[u8] = include_bytes!("../../fixtures/pbzx.pkg");

#[test]
fn pbzx_pkg_skips_unneeded_chunks_and_reads_a_mixed_raw_and_xz_payload() {
    let result = run(PBZX, 8192);
    assert_bundle(&result);
    assert!(result.bytes_read < result.total_size / 2);
}

#[test]
fn decoded_budget_is_shared_across_members_and_leaves_partial_results() {
    for (input, format) in [
        (TAR, "tar.gz"),
        (ZIP64, "zip"),
        (DMG, "dmg"),
        (PKG, "pkg"),
        (PBZX, "pkg"),
    ] {
        let full = run(input, 8192);
        assert!(matches!(full.status, Status::Complete), "{full:?}");
        let limit = full.decoded_bytes - 1;
        let partial = ready(scan_with_limits(
            &mut Memory(input),
            ScanLimits {
                byte_budget: 8192,
                decoded_byte_budget: limit,
                ..ScanLimits::new(8192)
            },
        ));
        assert_eq!(partial.format, Some(format));
        let message = "scan limit: decoded-byte budget reached";
        assert!(partial.decoded_bytes <= limit);
        assert_eq!(partial.bundle_id, full.bundle_id);
        assert_eq!(partial.architectures.len(), full.architectures.len());
        if matches!(partial.status, Status::Complete) {
            let inventory = partial.inventory.as_ref().unwrap();
            assert!(!inventory.complete);
            assert_eq!(inventory.incomplete_reason.as_deref(), Some(message));
            assert!(
                partial
                    .architectures
                    .iter()
                    .all(|arch| arch.header_verified)
            );
        } else {
            assert!(
                matches!(partial.status, Status::LimitReached),
                "{partial:?}"
            );
            assert_eq!(partial.error.as_deref(), Some(message));
            assert!(
                partial
                    .architectures
                    .iter()
                    .any(|arch| arch.code_signature_present.is_none())
            );
        }
    }
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

fn padded_tar(mut compressor: impl Write, size: u64) {
    let mut header = [0_u8; 512];
    header[..7].copy_from_slice(b"padding");
    header[124..136].copy_from_slice(format!("{size:011o}\0").as_bytes());
    header[148..156].fill(b' ');
    header[156] = b'0';
    header[257..263].copy_from_slice(b"ustar\0");
    let checksum: u64 = header.iter().map(|byte| u64::from(*byte)).sum();
    header[148..156].copy_from_slice(format!("{checksum:06o}\0 ").as_bytes());
    compressor.write_all(&header).unwrap();
    let mut zeros = std::io::repeat(0).take(size);
    std::io::copy(&mut zeros, &mut compressor).unwrap();
    compressor
        .write_all(include_bytes!("../../fixtures/app.tar"))
        .unwrap();
}

#[test]
fn local_scans_large_output_while_worker_enforces_decoded_and_ratio_limits() {
    let mut gzip = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
    padded_tar(&mut gzip, 2 * 1024 * 1024);
    let gzip = gzip.finish().unwrap();
    let mut bzip = bzip2::write::BzEncoder::new(Vec::new(), bzip2::Compression::fast());
    padded_tar(&mut bzip, 1024 * 1024);
    let bzip = bzip.finish().unwrap();

    for (artifact, worker_decoded_budget, policy) in [
        (gzip.as_slice(), 1024 * 1024, "decoded-byte budget reached"),
        (
            bzip.as_slice(),
            scan_core::DEFAULT_DECODED_BYTE_BUDGET,
            "compression expansion ratio exceeded",
        ),
    ] {
        let local = ScanLimits {
            byte_budget: 1,
            decoded_byte_budget: 1,
            ..ScanLimits::for_profile(Profile::Local)
        };
        let result = ready(scan_with_limits(&mut Memory(artifact), local));
        assert_bundle(&result);
        assert!(result.decoded_bytes > 1024 * 1024);

        let remote = ScanLimits {
            decoded_byte_budget: 1,
            ..ScanLimits::for_profile(Profile::RemoteCli)
        };
        assert_bundle(&ready(scan_with_limits(&mut Memory(artifact), remote)));

        let worker = ready(scan_with_limits(
            &mut Memory(artifact),
            ScanLimits {
                decoded_byte_budget: worker_decoded_budget,
                ..ScanLimits::for_profile(Profile::Worker)
            },
        ));
        assert!(matches!(worker.status, Status::LimitReached), "{worker:?}");
        assert_eq!(
            worker.error.as_deref(),
            Some(format!("scan limit: {policy}").as_str())
        );
    }
}

#[test]
fn worker_stops_at_explicit_deadline_and_profiles_keep_container_bounds() {
    let limited = ready(scan_target_with_deadline(
        &mut Memory(THIN),
        ScanLimits::for_profile(Profile::Worker),
        Target::Auto,
        Some(&|| true),
    ));
    assert!(matches!(limited.status, Status::LimitReached));
    assert_eq!(limited.reads, 0);
    assert_eq!(
        limited.error.as_deref(),
        Some("scan limit: scan deadline reached")
    );

    let mut truncated = FAT.to_vec();
    truncated.truncate(128);
    for profile in [Profile::Local, Profile::RemoteCli, Profile::Worker] {
        let result = ready(scan_with_limits(
            &mut Memory(&truncated),
            ScanLimits::for_profile(profile),
        ));
        assert!(matches!(result.status, Status::Invalid), "{result:?}");
    }
}

#[test]
fn local_diagnostics_preserve_embedded_plists_executable_prefixes_and_commands() {
    for input in [
        ZIP,
        ZIP64,
        DMG,
        APFS,
        PKG,
        TAR,
        TAR_REVERSED,
        include_bytes!("../../fixtures/nested-pkg.dmg"),
        include_bytes!("../../fixtures/late-bom.pkg"),
    ] {
        let result = ready(scan_core::scan_target_with_diagnostics(
            &mut Memory(input),
            ScanLimits::for_profile(Profile::Local),
            Target::Auto,
            None,
        ));
        assert!(matches!(result.status, Status::Complete), "{result:?}");
        let diagnostic = result
            .diagnostic
            .expect("archive subresult dropped diagnostic collection");
        assert!(
            diagnostic
                .info_plist_path
                .unwrap()
                .ends_with("/Contents/Info.plist")
        );
        assert!(diagnostic.info_plist_size.unwrap() > 0);
        assert_eq!(
            diagnostic.info_plist.unwrap().as_dictionary().unwrap()["CFBundleExecutable"]
                .as_string(),
            Some("FixtureBinary")
        );
        assert_eq!(
            diagnostic.executable.executable_prefix_hex.unwrap().len(),
            128
        );
        assert_eq!(
            diagnostic.executable.load_commands.len(),
            result.architectures.len()
        );
        assert!(
            diagnostic
                .executable
                .load_commands
                .iter()
                .all(|list| !list.truncated && !list.commands.is_empty())
        );
    }
}

use scan_core::{ReadAt, Result, ScanError, ScanResult, Status, scan};
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
fn zip64_with_comment_reads_binary_plist_and_deflated_executable() {
    let result = run(ZIP64, u64::MAX);
    assert_eq!(result.format, Some("zip"));
    assert_bundle(&result);
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
fn dmg_rejects_segmented_udif() {
    let mut data = DMG.to_vec();
    let segment_count = data.len() - 512 + 60;
    data[segment_count + 3] = 2;
    let result = run(&data, u64::MAX);
    assert_eq!(result.format, Some("dmg"));
    assert!(matches!(result.status, Status::Unsupported));
    assert_eq!(result.reads, 2);
}

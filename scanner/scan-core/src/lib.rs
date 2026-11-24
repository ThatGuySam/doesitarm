//! Range-based inspection of macOS downloads. The caller supplies all I/O.
#![forbid(unsafe_code)]

mod apfs;
mod bom;
mod bundle;
mod cpio;
mod decode;
mod diagnostic;
mod dmg;
mod gzip_tail;
mod hfs;
mod inflate;
mod inventory;
mod launcher;
mod local_bundle;
mod macho;
mod nested;
mod pbzx;
mod pkg;
mod plist_value;
mod sevenz;
mod stream_bundle;
mod tar;
mod udif_codec;
mod zip;

pub use diagnostic::ScanDiagnostic;
pub use inventory::{
    BinaryInventory, BundleBinary, is_macho as bundle_binary_is_macho, role as bundle_binary_role,
};
pub use launcher::ScriptRuntime;
pub use local_bundle::{LocalBundleMetadata, local_bundle_metadata};

use serde::Serialize;
use std::{collections::BTreeMap, fmt, str::FromStr};

const MIB: u64 = 1024 * 1024;
pub const REMOTE_BUDGET_TIERS: [u64; 3] = [8 * MIB, 64 * MIB, 256 * MIB];
pub const DEFAULT_DECODED_BYTE_BUDGET: u64 = 64 * MIB;
pub const WORKER_WALL_TIME_MS: u32 = 20_000;
const MAX_HOST_READS: u64 = 8192;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Profile {
    Local,
    RemoteCli,
    Worker,
}

impl FromStr for Profile {
    type Err = &'static str;

    fn from_str(value: &str) -> std::result::Result<Self, Self::Err> {
        match value {
            "local" => Ok(Self::Local),
            "remote-cli" => Ok(Self::RemoteCli),
            "worker" => Ok(Self::Worker),
            _ => Err("Expected a profile of local, remote-cli, or worker."),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct ScanLimits {
    pub profile: Profile,
    pub byte_budget: u64,
    pub decoded_byte_budget: u64,
}

impl ScanLimits {
    /// Keep the original bounded behavior for callers that supply a byte budget.
    pub const fn new(byte_budget: u64) -> Self {
        Self {
            byte_budget,
            ..Self::for_profile(Profile::Worker)
        }
    }

    pub const fn for_profile(profile: Profile) -> Self {
        let (byte_budget, decoded_byte_budget) = match profile {
            Profile::Local => (u64::MAX, u64::MAX),
            Profile::RemoteCli => (REMOTE_BUDGET_TIERS[0], u64::MAX),
            Profile::Worker => (REMOTE_BUDGET_TIERS[0], DEFAULT_DECODED_BYTE_BUDGET),
        };
        Self {
            profile,
            byte_budget,
            decoded_byte_budget,
        }
    }
}

/// Each call must return exactly the requested bytes or an error. Sizes and
/// offsets refer to the original representation and must stay stable.
#[allow(async_fn_in_trait)]
pub trait ReadAt {
    fn size(&self) -> u64;

    /// Upper bound for the next physical read when a wrapper meters a source.
    fn remaining_budget(&self) -> u64 {
        u64::MAX
    }
    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>>;
}

pub type Result<T> = std::result::Result<T, ScanError>;

#[derive(Clone, Copy, Default)]
pub enum Target<'a> {
    #[default]
    Auto,
    Bundle(&'a str),
    Executable(&'a str),
}

#[derive(Debug, Clone)]
pub enum ScanError {
    Budget,
    Limit(&'static str),
    WorkLimit(&'static str),
    Invalid(&'static str),
    Unsupported(&'static str),
    NotFound(&'static str),
    Source(String),
}

impl fmt::Display for ScanError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Budget => f.write_str("byte budget reached"),
            Self::Limit(s) | Self::WorkLimit(s) => write!(f, "scan limit: {s}"),
            Self::Invalid(s) => write!(f, "invalid data: {s}"),
            Self::Unsupported(s) => write!(f, "unsupported: {s}"),
            Self::NotFound(s) => write!(f, "not found: {s}"),
            Self::Source(s) => write!(f, "source: {s}"),
        }
    }
}
impl std::error::Error for ScanError {}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Complete,
    NoExecutable,
    Script,
    BudgetExhausted,
    LimitReached,
    Invalid,
    Unsupported,
    NotFound,
    SourceError,
}

#[derive(Debug, Clone, Serialize)]
pub struct Architecture {
    pub name: &'static str,
    pub cpu_type: u32,
    pub cpu_subtype: u32,
    pub offset: u64,
    pub size: u64,
    pub header_verified: bool,
    pub min_macos: Option<String>,
    pub code_signature_present: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct ExecutableCandidate {
    pub path: String,
    pub size: u64,
    pub architectures: Vec<Architecture>,
}

#[derive(Clone, Debug, Default, Serialize)]
pub struct InstallerMetadata {
    pub title: Option<String>,
    pub host_architectures: Vec<String>,
    pub package_id: Option<String>,
    pub package_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub install_location: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub payload_bundles: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub script_entries: Vec<String>,
    pub min_macos: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub remote_components: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ScanResult {
    pub format: Option<&'static str>,
    pub status: Status,
    pub architectures: Vec<Architecture>,
    pub bundle_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bundle_kind: Option<&'static str>,
    pub bundle_id: Option<String>,
    pub version: Option<String>,
    pub name: Option<String>,
    pub min_macos: Option<String>,
    pub executable_name: Option<String>,
    pub executable_size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub executable_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub executable_resolution: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bundle_metadata_source: Option<&'static str>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub nested_artifacts: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub candidate_executables: Vec<ExecutableCandidate>,
    pub installer: Option<InstallerMetadata>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inventory: Option<BinaryInventory>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub script_runtime: Option<ScriptRuntime>,
    /// Unique source bytes in successful range responses.
    pub bytes_read: u64,
    /// Sum of lengths of attempted source requests, including overlaps and failures.
    pub bytes_requested: u64,
    /// Decoder output charged to the work budget, including reserved whole chunks.
    pub decoded_bytes: u64,
    pub reads: u64,
    pub total_size: u64,
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diagnostic: Option<ScanDiagnostic>,
}

impl ScanResult {
    pub fn new(total_size: u64) -> Self {
        Self {
            format: None,
            status: Status::Complete,
            architectures: Vec::new(),
            bundle_path: None,
            bundle_kind: None,
            bundle_id: None,
            version: None,
            name: None,
            min_macos: None,
            executable_name: None,
            executable_size: None,
            executable_path: None,
            executable_resolution: None,
            bundle_metadata_source: None,
            nested_artifacts: Vec::new(),
            candidate_executables: Vec::new(),
            installer: None,
            inventory: None,
            script_runtime: None,
            bytes_read: 0,
            bytes_requested: 0,
            decoded_bytes: 0,
            reads: 0,
            total_size,
            error: None,
            diagnostic: None,
        }
    }

    pub fn set_error(&mut self, error: ScanError) {
        self.status = match error {
            ScanError::Budget => Status::BudgetExhausted,
            ScanError::Limit(_) | ScanError::WorkLimit(_) => Status::LimitReached,
            ScanError::Invalid(_) => Status::Invalid,
            ScanError::Unsupported(_) => Status::Unsupported,
            ScanError::NotFound(_) => Status::NotFound,
            ScanError::Source(_) => Status::SourceError,
        };
        self.error = Some(error.to_string());
    }
}

/// Read metadata for a local app directory before opening its executable.
pub fn bundle_metadata(plist: &[u8], bundle_path: &str) -> ScanResult {
    let mut result = ScanResult::new(plist.len() as u64);
    result.format = Some("app");
    if result.total_size > bundle::MAX_PLIST {
        result.set_error(ScanError::Limit("bundle Info.plist size"));
        return result;
    }
    result.bytes_read = result.total_size;
    result.bytes_requested = result.total_size;
    result.reads = 1;
    if let Err(error) = bundle::apply_plist(plist, bundle_path, &mut result) {
        result.set_error(error);
    }
    result
}

/// Uses the default decoded-byte budget. The supplied byte budget covers every
/// attempted host read, including repeated ranges.
pub async fn scan(source: &mut impl ReadAt, budget: u64) -> ScanResult {
    scan_target_with_limits(source, ScanLimits::new(budget), Target::Auto).await
}

pub async fn scan_with_limits(source: &mut impl ReadAt, limits: ScanLimits) -> ScanResult {
    scan_target_with_limits(source, limits, Target::Auto).await
}

/// Select a bundle or standalone executable by its declared archive path.
pub async fn scan_target(source: &mut impl ReadAt, budget: u64, target: Target<'_>) -> ScanResult {
    scan_target_with_limits(source, ScanLimits::new(budget), target).await
}

pub async fn scan_target_with_limits(
    source: &mut impl ReadAt,
    limits: ScanLimits,
    target: Target<'_>,
) -> ScanResult {
    scan_target_with_deadline(source, limits, target, None).await
}

/// A host can supply a cooperative deadline for the scan. Wasm hosts supply
/// their own clock. Native Worker-profile scans default to a 20 s deadline.
pub async fn scan_target_with_deadline(
    source: &mut impl ReadAt,
    limits: ScanLimits,
    target: Target<'_>,
    expired: Option<&dyn Fn() -> bool>,
) -> ScanResult {
    scan_internal(source, limits, target, expired, false).await
}

/// A local scan that retains the property list and executable evidence the
/// parsers encounter. Remote callers retain the ordinary compact result.
pub async fn scan_target_with_diagnostics(
    source: &mut impl ReadAt,
    limits: ScanLimits,
    target: Target<'_>,
    expired: Option<&dyn Fn() -> bool>,
) -> ScanResult {
    scan_internal(
        source,
        limits,
        target,
        expired,
        limits.profile == Profile::Local,
    )
    .await
}

async fn scan_internal(
    source: &mut impl ReadAt,
    limits: ScanLimits,
    target: Target<'_>,
    expired: Option<&dyn Fn() -> bool>,
    diagnostic: bool,
) -> ScanResult {
    let strict = limits.profile == Profile::Worker;
    #[cfg(not(target_arch = "wasm32"))]
    let start = std::time::Instant::now();
    #[cfg(not(target_arch = "wasm32"))]
    let worker_expired =
        || start.elapsed() >= std::time::Duration::from_millis(WORKER_WALL_TIME_MS.into());
    #[cfg(not(target_arch = "wasm32"))]
    let expired = expired.or_else(|| strict.then_some(&worker_expired as &dyn Fn() -> bool));

    let size = source.size();
    let mut result = ScanResult::new(size);
    if diagnostic {
        result.diagnostic = Some(ScanDiagnostic::default());
    }
    let mut input = Metered {
        source,
        size,
        budget: if limits.profile == Profile::Local {
            u64::MAX
        } else {
            limits.byte_budget
        },
        strict,
        expired,
        requested: 0,
        reads: 0,
        coverage: Coverage::default(),
    };
    let decoded = if strict {
        limits.decoded_byte_budget
    } else {
        u64::MAX
    };
    let work = decode::DecodeBudget::with_limits(decoded, limits.profile, expired);
    if let Err(error) = inspect(&mut input, &work, target, &mut result).await {
        result.set_error(error);
    }
    if result.min_macos.is_none() {
        result.min_macos = result
            .architectures
            .iter()
            .filter_map(|arch| arch.min_macos.as_ref())
            .min_by_key(|version| {
                let mut parts = version
                    .split('.')
                    .map(|part| part.parse::<u16>().unwrap_or(0));
                [
                    parts.next().unwrap_or(0),
                    parts.next().unwrap_or(0),
                    parts.next().unwrap_or(0),
                ]
            })
            .cloned();
    }
    inventory::finalize(&mut result);
    result.bytes_read = input.coverage.bytes;
    result.bytes_requested = input.requested;
    result.decoded_bytes = work.used();
    result.reads = input.reads;
    result
}

async fn inspect(
    input: &mut impl ReadAt,
    work: &decode::DecodeBudget<'_>,
    target: Target<'_>,
    out: &mut ScanResult,
) -> Result<()> {
    if let Target::Bundle(path) | Target::Executable(path) = target
        && bundle::archive_path(path).is_none()
    {
        return Err(ScanError::Invalid("declared archive target path"));
    }
    if input.size() < 4 {
        return Err(ScanError::Invalid("missing file magic"));
    }
    let magic = input.read_at(0, 4).await?;
    if macho::kind(&magic).is_some() {
        out.format = Some("macho");
        if matches!(target, Target::Bundle(_)) {
            return Err(ScanError::NotFound("declared bundle in bare Mach-O"));
        }
        if let Target::Executable(path) = target {
            out.executable_path = Some(path.to_owned());
        }
        out.executable_size = Some(input.size());
        out.scan_macho(input).await?;
        return Ok(());
    }
    if magic.starts_with(b"#!") {
        out.format = Some("script");
        out.executable_size = Some(input.size());
        return Err(ScanError::Unsupported("declared executable is a script"));
    }
    if matches!(
        magic.as_slice(),
        b"PK\x03\x04" | b"PK\x05\x06" | b"PK\x07\x08"
    ) {
        out.format = Some("zip");
        return zip::scan(input, work, target, out).await;
    }
    if magic.starts_with(b"\x1f\x8b") {
        return compressed_tar(input, work, target, out, "tar.gz", inflate::Codec::Gzip).await;
    }
    if magic == b"0707" && input.size() >= 6 {
        let mut cpio_magic = magic.clone();
        cpio_magic.extend(input.read_at(4, 2).await?);
        if cpio::recognized(&cpio_magic) {
            out.format = Some("cpio");
            return cpio::scan_with(input, work, stream_bundle::StreamBundle::new(target), out)
                .await;
        }
    }
    if magic == b"7z\xbc\xaf" && input.size() >= 32 && input.read_at(4, 2).await? == b"\x27\x1c" {
        out.format = Some("7z");
        return sevenz::scan(input, work, target, out).await;
    }
    if magic == b"xar!" {
        out.format = Some("pkg");
        return pkg::scan(input, work, target, out).await;
    }
    if input.size() >= 512 {
        let trailer = input.read_at(input.size() - 512, 512).await?;
        if trailer.starts_with(b"koly") {
            out.format = Some("dmg");
            return dmg::scan(input, work, &trailer, target, out).await;
        }
    }
    // UDIF stores compressed runs from byte zero. Its koly footer takes
    // precedence over a bzip2 or XZ prefix from the first run.
    if inflate::zstd_magic(&magic) {
        return compressed_tar(input, work, target, out, "tar.zst", inflate::Codec::Zstd).await;
    }
    if magic.starts_with(b"BZh") {
        return compressed_tar(input, work, target, out, "tar.bz2", inflate::Codec::Bzip2).await;
    }
    if magic == b"\xfd7zX" && input.size() >= 6 && input.read_at(4, 2).await? == b"Z\0" {
        return compressed_tar(input, work, target, out, "tar.xz", inflate::Codec::Xz).await;
    }
    if input.size() >= 512 {
        let header = input.read_at(0, 512).await?;
        if tar::is_header(&header) {
            out.format = Some("tar");
            return tar::scan(input, work, target, out).await;
        }
        if dmg::scan_raw(input, &header, work, target, out).await? {
            return Ok(());
        }
        // Archive prefixes such as Steam's 20-byte wrapper precede the
        // first local file header. ZIP validates the shifted directory.
        if let Some(offset) = header.windows(4).position(|magic| magic == b"PK\x03\x04") {
            out.format = Some("zip");
            return zip::scan_prefixed(input, offset as u64, work, target, out).await;
        }
    }
    Err(ScanError::Unsupported("unrecognized file format"))
}

async fn compressed_tar(
    input: &mut impl ReadAt,
    work: &decode::DecodeBudget<'_>,
    target: Target<'_>,
    out: &mut ScanResult,
    format: &'static str,
    codec: inflate::Codec,
) -> Result<()> {
    out.format = Some(format);
    let size = input.size();
    let source = Window::new(input, 0, size)?;
    let mut source = inflate::Forward::new(source, work.stream_limit(), codec, work)?;
    let primary = tar::scan(&mut source, work, target, out).await;
    if let Some(runtime) = out.script_runtime.as_mut()
        && runtime.architectures.is_empty()
        && source.remaining_budget() > 64 * 1024
        && source.rewind_for(0).is_ok()
    {
        tar::read_runtime(&mut source, work, runtime).await;
    }
    primary
}

struct Metered<'a, S> {
    source: &'a mut S,
    size: u64,
    budget: u64,
    strict: bool,
    expired: Option<&'a dyn Fn() -> bool>,
    requested: u64,
    reads: u64,
    coverage: Coverage,
}

impl<S: ReadAt> ReadAt for Metered<'_, S> {
    fn size(&self) -> u64 {
        self.size
    }

    fn remaining_budget(&self) -> u64 {
        self.budget - self.requested
    }

    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>> {
        decode::check_deadline(self.expired)?;
        check_range(self.size, offset, len as u64)?;
        if len == 0 {
            return Ok(Vec::new());
        }
        if len as u64 > self.remaining_budget() {
            return Err(ScanError::Budget);
        }
        if self.strict && self.reads == MAX_HOST_READS {
            return Err(ScanError::WorkLimit("too many source range requests"));
        }
        self.reads += 1;
        self.requested += len as u64;
        let bytes = self.source.read_at(offset, len).await?;
        if bytes.len() != len {
            return Err(ScanError::Source(format!(
                "range at {offset} expected {len} bytes, received {}",
                bytes.len()
            )));
        }
        self.coverage.insert(offset, offset + len as u64);
        decode::check_deadline(self.expired)?;
        Ok(bytes)
    }
}

#[derive(Default)]
struct Coverage {
    // Disjoint, non-adjacent half-open intervals, keyed by start.
    ranges: BTreeMap<u64, u64>,
    bytes: u64,
}

impl Coverage {
    fn insert(&mut self, mut start: u64, mut end: u64) {
        if let Some((&first, &last)) = self.ranges.range(..=start).next_back()
            && last >= start
        {
            if last >= end {
                return;
            }
            self.ranges.remove(&first);
            self.bytes -= last - first;
            start = first;
        }
        while let Some((&first, &last)) = self.ranges.range(start..=end).next() {
            self.ranges.remove(&first);
            self.bytes -= last - first;
            end = end.max(last);
        }
        self.ranges.insert(start, end);
        self.bytes += end - start;
    }
}

fn check_range(size: u64, offset: u64, len: u64) -> Result<()> {
    if offset > size || len > size - offset {
        return Err(ScanError::Invalid("range outside its container"));
    }
    Ok(())
}

pub(crate) fn le32(b: &[u8], i: usize) -> u32 {
    u32::from_le_bytes(b[i..i + 4].try_into().unwrap())
}

pub(crate) fn be32(b: &[u8], i: usize) -> u32 {
    u32::from_be_bytes(b[i..i + 4].try_into().unwrap())
}

fn le16(b: &[u8], i: usize) -> u16 {
    u16::from_le_bytes(b[i..i + 2].try_into().unwrap())
}

fn le64(b: &[u8], i: usize) -> u64 {
    u64::from_le_bytes(b[i..i + 8].try_into().unwrap())
}

/// Virtual subfile whose reads are metered by the underlying host.
struct Window<'a, S> {
    source: &'a mut S,
    offset: u64,
    size: u64,
}

impl<'a, S: ReadAt> Window<'a, S> {
    fn new(source: &'a mut S, offset: u64, size: u64) -> Result<Self> {
        check_range(source.size(), offset, size)?;
        Ok(Self {
            source,
            offset,
            size,
        })
    }
}

impl<S: ReadAt> ReadAt for Window<'_, S> {
    fn size(&self) -> u64 {
        self.size
    }

    fn remaining_budget(&self) -> u64 {
        self.source.remaining_budget()
    }

    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>> {
        check_range(self.size, offset, len as u64)?;
        self.source.read_at(self.offset + offset, len).await
    }
}

fn be16(b: &[u8], i: usize) -> u16 {
    u16::from_be_bytes(b[i..i + 2].try_into().unwrap())
}

fn be64(b: &[u8], i: usize) -> u64 {
    u64::from_be_bytes(b[i..i + 8].try_into().unwrap())
}

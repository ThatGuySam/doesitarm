//! Range-based inspection of macOS downloads. The caller supplies all I/O.
#![forbid(unsafe_code)]

mod apfs;
mod bundle;
mod cpio;
mod decode;
mod dmg;
mod hfs;
mod inflate;
mod macho;
mod pbzx;
mod pkg;
mod plist_value;
mod stream_bundle;
mod tar;
mod udif_codec;
mod zip;

use serde::Serialize;
use std::{collections::BTreeMap, fmt};

pub const DEFAULT_DECODED_BYTE_BUDGET: u64 = 64 * 1024 * 1024;
const MAX_HOST_READS: u64 = 8192;

#[derive(Debug, Clone, Copy)]
pub struct ScanLimits {
    pub byte_budget: u64,
    pub decoded_byte_budget: u64,
}

impl ScanLimits {
    pub const fn new(byte_budget: u64) -> Self {
        Self {
            byte_budget,
            decoded_byte_budget: DEFAULT_DECODED_BYTE_BUDGET,
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

#[derive(Debug, Default, Serialize)]
pub struct InstallerMetadata {
    pub title: Option<String>,
    pub host_architectures: Vec<String>,
    pub package_id: Option<String>,
    pub package_version: Option<String>,
    pub min_macos: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ScanResult {
    pub format: Option<&'static str>,
    pub status: Status,
    pub architectures: Vec<Architecture>,
    pub bundle_path: Option<String>,
    pub bundle_id: Option<String>,
    pub version: Option<String>,
    pub name: Option<String>,
    pub min_macos: Option<String>,
    pub executable_name: Option<String>,
    pub executable_size: Option<u64>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub candidate_executables: Vec<ExecutableCandidate>,
    pub installer: Option<InstallerMetadata>,
    /// Unique source bytes in successful range responses.
    pub bytes_read: u64,
    /// Sum of lengths of attempted source requests, including overlaps and failures.
    pub bytes_requested: u64,
    /// Decoder output charged to the work budget, including reserved whole chunks.
    pub decoded_bytes: u64,
    pub reads: u64,
    pub total_size: u64,
    pub error: Option<String>,
}

impl ScanResult {
    pub fn new(total_size: u64) -> Self {
        Self {
            format: None,
            status: Status::Complete,
            architectures: Vec::new(),
            bundle_path: None,
            bundle_id: None,
            version: None,
            name: None,
            min_macos: None,
            executable_name: None,
            executable_size: None,
            candidate_executables: Vec::new(),
            installer: None,
            bytes_read: 0,
            bytes_requested: 0,
            decoded_bytes: 0,
            reads: 0,
            total_size,
            error: None,
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
    scan_with_limits(source, ScanLimits::new(budget)).await
}

pub async fn scan_with_limits(source: &mut impl ReadAt, limits: ScanLimits) -> ScanResult {
    let size = source.size();
    let mut result = ScanResult::new(size);
    let mut input = Metered {
        source,
        size,
        budget: limits.byte_budget,
        requested: 0,
        reads: 0,
        coverage: Coverage::default(),
    };
    let mut work = decode::DecodeBudget::new(limits.decoded_byte_budget);
    if let Err(error) = inspect(&mut input, &mut work, &mut result).await {
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
    result.bytes_read = input.coverage.bytes;
    result.bytes_requested = input.requested;
    result.decoded_bytes = work.used();
    result.reads = input.reads;
    result
}

async fn inspect(
    input: &mut impl ReadAt,
    work: &mut decode::DecodeBudget,
    out: &mut ScanResult,
) -> Result<()> {
    if input.size() < 4 {
        return Err(ScanError::Invalid("missing file magic"));
    }
    let magic = input.read_at(0, 4).await?;
    if macho::kind(&magic).is_some() {
        out.format = Some("macho");
        out.executable_size = Some(input.size());
        macho::scan(input, &mut out.architectures).await?;
        return Ok(());
    }
    if matches!(
        magic.as_slice(),
        b"PK\x03\x04" | b"PK\x05\x06" | b"PK\x07\x08"
    ) {
        out.format = Some("zip");
        return zip::scan(input, work, out).await;
    }
    if magic.starts_with(b"\x1f\x8b") {
        out.format = Some("tar.gz");
        return tar::scan(input, work, out).await;
    }
    if magic == b"xar!" {
        out.format = Some("pkg");
        return pkg::scan(input, work, out).await;
    }
    if input.size() >= 512 {
        let trailer = input.read_at(input.size() - 512, 512).await?;
        if trailer.starts_with(b"koly") {
            out.format = Some("dmg");
            return dmg::scan(input, work, &trailer, out).await;
        }
    }
    Err(ScanError::Unsupported("unrecognized file format"))
}

struct Metered<'a, S> {
    source: &'a mut S,
    size: u64,
    budget: u64,
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
        check_range(self.size, offset, len as u64)?;
        if len == 0 {
            return Ok(Vec::new());
        }
        if len as u64 > self.remaining_budget() {
            return Err(ScanError::Budget);
        }
        if self.reads == MAX_HOST_READS {
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

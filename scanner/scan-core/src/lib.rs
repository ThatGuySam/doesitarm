//! Range-based inspection of macOS downloads. The caller supplies all I/O.
#![forbid(unsafe_code)]

mod apfs;
mod bom;
mod bundle;
mod cpio;
mod dmg;
mod gzip_tail;
mod hfs;
mod inflate;
mod macho;
mod nested;
mod pbzx;
mod pkg;
mod stream_bundle;
mod tar;
mod udif_codec;
mod zip;

use serde::Serialize;
use std::fmt;

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
    Invalid(&'static str),
    Unsupported(&'static str),
    NotFound(&'static str),
    Source(String),
}

impl fmt::Display for ScanError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Budget => f.write_str("byte budget reached"),
            Self::Limit(s) => write!(f, "scan limit: {s}"),
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

#[derive(Clone, Debug, Default, Serialize)]
pub struct InstallerMetadata {
    pub title: Option<String>,
    pub host_architectures: Vec<String>,
    pub package_id: Option<String>,
    pub package_version: Option<String>,
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
    pub bundle_id: Option<String>,
    pub version: Option<String>,
    pub name: Option<String>,
    pub min_macos: Option<String>,
    pub executable_name: Option<String>,
    pub executable_size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub executable_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bundle_metadata_source: Option<&'static str>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub nested_artifacts: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub candidate_executables: Vec<ExecutableCandidate>,
    pub installer: Option<InstallerMetadata>,
    pub bytes_read: u64,
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
            executable_path: None,
            bundle_metadata_source: None,
            nested_artifacts: Vec::new(),
            candidate_executables: Vec::new(),
            installer: None,
            bytes_read: 0,
            reads: 0,
            total_size,
            error: None,
        }
    }

    pub fn set_error(&mut self, error: ScanError) {
        self.status = match error {
            ScanError::Budget => Status::BudgetExhausted,
            ScanError::Limit(_) => Status::LimitReached,
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
    result.reads = 1;
    if let Err(error) = bundle::apply_plist(plist, bundle_path, &mut result) {
        result.set_error(error);
    }
    result
}

/// Byte budget covers successful host reads (including repeated ranges). A
/// request exceeding the remaining budget is rejected before calling the host.
pub async fn scan(source: &mut impl ReadAt, budget: u64) -> ScanResult {
    scan_target(source, budget, Target::Auto).await
}

/// Select a bundle or standalone executable by its declared archive path.
pub async fn scan_target(source: &mut impl ReadAt, budget: u64, target: Target<'_>) -> ScanResult {
    let size = source.size();
    let mut result = ScanResult::new(size);
    let mut input = Metered {
        source,
        size,
        budget,
        bytes: 0,
        reads: 0,
    };
    if let Err(error) = inspect(&mut input, target, &mut result).await {
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
    result.bytes_read = input.bytes;
    result.reads = input.reads;
    result
}

async fn inspect(input: &mut impl ReadAt, target: Target<'_>, out: &mut ScanResult) -> Result<()> {
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
        macho::scan(input, &mut out.architectures).await?;
        return Ok(());
    }
    if matches!(
        magic.as_slice(),
        b"PK\x03\x04" | b"PK\x05\x06" | b"PK\x07\x08"
    ) {
        out.format = Some("zip");
        return zip::scan(input, target, out).await;
    }
    if magic.starts_with(b"\x1f\x8b") {
        return compressed_tar(input, target, out, "tar.gz", inflate::Codec::Gzip).await;
    }
    if magic == b"0707" && input.size() >= 6 {
        let mut cpio_magic = magic.clone();
        cpio_magic.extend(input.read_at(4, 2).await?);
        if cpio::recognized(&cpio_magic) {
            out.format = Some("cpio");
            return cpio::scan_with(input, stream_bundle::StreamBundle::new(target), out).await;
        }
    }
    if magic == b"xar!" {
        out.format = Some("pkg");
        return pkg::scan(input, target, out).await;
    }
    if input.size() >= 512 {
        let trailer = input.read_at(input.size() - 512, 512).await?;
        if trailer.starts_with(b"koly") {
            out.format = Some("dmg");
            return dmg::scan(input, &trailer, target, out).await;
        }
    }
    // UDIF stores compressed runs from byte zero. Its koly footer takes
    // precedence over a bzip2 or XZ prefix from the first run.
    if magic.starts_with(b"BZh") {
        return compressed_tar(input, target, out, "tar.bz2", inflate::Codec::Bzip2).await;
    }
    if magic == b"\xfd7zX" && input.size() >= 6 && input.read_at(4, 2).await? == b"Z\0" {
        return compressed_tar(input, target, out, "tar.xz", inflate::Codec::Xz).await;
    }
    if input.size() >= 512 {
        let header = input.read_at(0, 512).await?;
        if tar::is_header(&header) {
            out.format = Some("tar");
            return tar::scan(input, target, out).await;
        }
    }
    Err(ScanError::Unsupported("unrecognized file format"))
}

async fn compressed_tar(
    input: &mut impl ReadAt,
    target: Target<'_>,
    out: &mut ScanResult,
    format: &'static str,
    codec: inflate::Codec,
) -> Result<()> {
    out.format = Some(format);
    let size = input.size();
    let source = Window::new(input, 0, size)?;
    tar::scan(
        &mut inflate::Forward::new(source, inflate::STREAM_OUTPUT_LIMIT, codec),
        target,
        out,
    )
    .await
}

struct Metered<'a, S> {
    source: &'a mut S,
    size: u64,
    budget: u64,
    bytes: u64,
    reads: u64,
}

impl<S: ReadAt> ReadAt for Metered<'_, S> {
    fn size(&self) -> u64 {
        self.size
    }

    fn remaining_budget(&self) -> u64 {
        self.budget.saturating_sub(self.bytes)
    }

    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>> {
        check_range(self.size, offset, len as u64)?;
        if len == 0 {
            return Ok(Vec::new());
        }
        if len as u64 > self.remaining_budget() {
            return Err(ScanError::Budget);
        }
        self.reads += 1;
        let bytes = self.source.read_at(offset, len).await?;
        if bytes.len() != len {
            return Err(ScanError::Source(format!(
                "range at {offset} expected {len} bytes, received {}",
                bytes.len()
            )));
        }
        self.bytes += len as u64;
        Ok(bytes)
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

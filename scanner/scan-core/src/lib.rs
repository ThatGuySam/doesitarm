//! Range-based inspection of macOS downloads. The caller supplies all I/O.
#![forbid(unsafe_code)]

mod macho;

use serde::Serialize;
use std::fmt;

/// Each call must return exactly the requested bytes or an error. Sizes and
/// offsets refer to the original representation and must stay stable.
#[allow(async_fn_in_trait)]
pub trait ReadAt {
    fn size(&self) -> u64;
    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>>;
}

pub type Result<T> = std::result::Result<T, ScanError>;

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

/// Byte budget covers successful host reads (including repeated ranges). A
/// request exceeding the remaining budget is rejected before calling the host.
pub async fn scan(source: &mut impl ReadAt, budget: u64) -> ScanResult {
    let size = source.size();
    let mut result = ScanResult::new(size);
    let mut input = Metered {
        source,
        size,
        budget,
        bytes: 0,
        reads: 0,
    };
    if let Err(error) = inspect(&mut input, &mut result).await {
        result.set_error(error);
    }
    result.bytes_read = input.bytes;
    result.reads = input.reads;
    result
}

async fn inspect(input: &mut impl ReadAt, out: &mut ScanResult) -> Result<()> {
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
    Err(ScanError::Unsupported("unrecognized file format"))
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

    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>> {
        check_range(self.size, offset, len as u64)?;
        if len == 0 {
            return Ok(Vec::new());
        }
        if len as u64 > self.budget - self.bytes {
            return Err(ScanError::Budget);
        }
        self.reads += 1;
        let bytes = self.source.read_at(offset, len).await?;
        self.bytes += bytes.len() as u64;
        if bytes.len() != len {
            return Err(ScanError::Source(format!(
                "range at {offset} expected {len} bytes, received {}",
                bytes.len()
            )));
        }
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

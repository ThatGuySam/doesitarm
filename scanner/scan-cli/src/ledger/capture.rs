use super::{Result, privacy};
use crate::{Deadline, Output, blocking, http};
use scan_core::{ReadAt, ScanError, ScanLimits, Target};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::time::Instant;
use ureq::{Body, ResponseExt, http::Response};

pub(crate) type ReplayResult<T> = Result<T>;

pub(super) const KIT_BYTES: usize = 1_800_000;
const LOG_LIMIT: usize = 1600;
pub(super) const SHIM_BYTES: usize = 288 * 1024 * 1024;
pub(super) const SHIM_LOG: usize = 32_768;

#[derive(Clone, Default, Deserialize, Serialize)]
pub(crate) struct HttpEvidence {
    pub status: u16,
    pub final_url: String,
    pub redirects: Vec<String>,
    pub headers: BTreeMap<String, String>,
}

impl HttpEvidence {
    pub fn from_response(response: &Response<Body>) -> Self {
        const HEADERS: &[&str] = &[
            "content-length",
            "content-range",
            "accept-ranges",
            "etag",
            "last-modified",
            "content-type",
            "server",
            "content-encoding",
        ];
        Self {
            status: response.status().as_u16(),
            final_url: response.get_uri().to_string(),
            redirects: response
                .get_redirect_history()
                .unwrap_or_default()
                .iter()
                .map(ToString::to_string)
                .collect(),
            headers: HEADERS
                .iter()
                .filter_map(|&name| {
                    Some((
                        name.to_owned(),
                        response.headers().get(name)?.to_str().ok()?.to_owned(),
                    ))
                })
                .collect(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct Span {
    pub offset: u64,
    pub length: usize,
    pub purpose: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload_offset: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<CapturedError>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "kind", content = "text", rename_all = "snake_case")]
pub(crate) enum CapturedError {
    Budget,
    Deadline,
    InvalidStreamRange,
    Source(String),
    Other(String),
}

impl From<&ScanError> for CapturedError {
    fn from(error: &ScanError) -> Self {
        match error {
            ScanError::Budget => Self::Budget,
            ScanError::WorkLimit("scan deadline reached") => Self::Deadline,
            ScanError::Invalid("range outside streamed response") => Self::InvalidStreamRange,
            ScanError::Source(message) => Self::Source(privacy::text(message)),
            _ => Self::Other(privacy::text(&error.to_string())),
        }
    }
}

impl CapturedError {
    fn as_error(&self) -> ScanError {
        match self {
            Self::Budget => ScanError::Budget,
            Self::Deadline => ScanError::WorkLimit("scan deadline reached"),
            Self::InvalidStreamRange => ScanError::Invalid("range outside streamed response"),
            Self::Source(text) | Self::Other(text) => ScanError::Source(text.clone()),
        }
    }
}

#[derive(Clone, Default, Deserialize, Serialize)]
pub(crate) struct Phase {
    pub transport: String,
    pub size: u64,
    pub budget: u64,
    pub source_bytes: Option<u64>,
    pub source_etag: Option<String>,
    pub source_content_type: Option<String>,
    pub response: Option<HttpEvidence>,
    pub early_error: Option<CapturedError>,
    pub read_log: Vec<Span>,
    pub deadline_check: Option<u64>,
    pub log_overflow: usize,
    pub log_sha256: Option<String>,
    pub run_core: bool,
    pub restarted: bool,
    pub fallback_budget_exhausted: bool,
    pub stream_deadline: bool,
}

pub(crate) struct Capture {
    pub(super) probe: Option<HttpEvidence>,
    pub(super) probe_error: Option<CapturedError>,
    pub(crate) phases: Vec<Phase>,
    pub(super) payload: Vec<u8>,
    pub(super) over_limit: bool,
    pub(super) prefix: Vec<u8>,
    payload_limit: usize,
    log_limit: usize,
}

impl Capture {
    pub(super) fn new(keep_bytes: bool) -> Self {
        Self::with_limits(if keep_bytes { KIT_BYTES } else { 0 }, LOG_LIMIT)
    }

    pub(super) fn shim() -> Self {
        Self::with_limits(SHIM_BYTES, SHIM_LOG)
    }

    fn with_limits(payload_limit: usize, log_limit: usize) -> Self {
        Self {
            probe: None,
            probe_error: None,
            phases: Vec::new(),
            payload: Vec::new(),
            over_limit: false,
            prefix: Vec::new(),
            payload_limit,
            log_limit,
        }
    }

    pub fn probe_response(&mut self, response: &Response<Body>) {
        self.probe = Some(HttpEvidence::from_response(response));
    }

    pub fn probe_error(&mut self, error: &ScanError) {
        self.probe_error = Some(CapturedError::from(error));
    }

    pub fn prefix(&mut self, offset: u64, data: &[u8]) {
        if offset <= self.prefix.len() as u64 && self.prefix.len() < 512 {
            let covered = self.prefix.len() - offset as usize;
            if let Some(fresh) = data.get(covered..) {
                self.prefix
                    .extend_from_slice(&fresh[..fresh.len().min(512 - self.prefix.len())]);
            }
        }
    }
}

struct RecordReads<'a, S> {
    source: &'a mut S,
    capture: &'a mut Capture,
    phase: &'a mut Phase,
    hash: Sha256,
}

impl<S: ReadAt> ReadAt for RecordReads<'_, S> {
    fn size(&self) -> u64 {
        self.source.size()
    }
    fn remaining_budget(&self) -> u64 {
        self.source.remaining_budget()
    }

    async fn read_at(&mut self, offset: u64, len: usize) -> scan_core::Result<Vec<u8>> {
        self.read_at_for(offset, len, "container_data").await
    }

    async fn read_at_for(
        &mut self,
        offset: u64,
        len: usize,
        purpose: &'static str,
    ) -> scan_core::Result<Vec<u8>> {
        let result = self.source.read_at_for(offset, len, purpose).await;
        let mut span = Span {
            offset,
            length: len,
            purpose: purpose.to_owned(),
            payload_offset: None,
            error: result.as_ref().err().map(CapturedError::from),
        };
        if let Ok(data) = &result {
            self.capture.prefix(offset, data);
            if self.capture.payload_limit > 0 && !self.capture.over_limit {
                let existing = self.phase.read_log.iter().find_map(|earlier| {
                    let start = usize::try_from(offset.checked_sub(earlier.offset)?).ok()?;
                    let position = earlier.payload_offset?.checked_add(start)?;
                    if start.checked_add(len)? <= earlier.length
                        && self
                            .capture
                            .payload
                            .get(position..position.checked_add(len)?)
                            == Some(data)
                    {
                        Some(position)
                    } else {
                        None
                    }
                });
                if let Some(existing) = existing {
                    span.payload_offset = Some(existing);
                } else if self.capture.payload.len() + data.len() <= self.capture.payload_limit {
                    span.payload_offset = Some(self.capture.payload.len());
                    self.capture.payload.extend_from_slice(data);
                } else {
                    self.capture.over_limit = true;
                    self.capture.payload.clear();
                }
            }
        }
        self.hash
            .update(serde_json::to_vec(&span).expect("span serialization"));
        if self.phase.read_log.len() == self.capture.log_limit {
            self.phase.log_overflow += 1;
        } else {
            self.phase.read_log.push(span);
        }
        result
    }
}

pub(crate) fn core(
    source: &mut impl ReadAt,
    limits: ScanLimits,
    target: Target<'_>,
    deadline: Option<Deadline>,
    capture: &mut Capture,
    phase: &mut Phase,
) -> scan_core::ScanResult {
    phase.run_core = true;
    phase.size = source.size();
    phase.budget = limits.byte_budget;
    let checks = std::cell::Cell::new(0);
    let timed_out = std::cell::Cell::new(None);
    let expired = || {
        let check = checks.get() + 1;
        checks.set(check);
        if deadline.is_some_and(Deadline::expired) {
            timed_out.set(timed_out.get().or(Some(check)));
            true
        } else {
            false
        }
    };
    let mut recording = RecordReads {
        source,
        capture,
        phase,
        hash: Sha256::new(),
    };
    let result = blocking::scan(
        &mut recording,
        limits,
        target,
        deadline.map(|_| &expired as &dyn Fn() -> bool),
        true,
    );
    recording.phase.deadline_check = timed_out.get();
    if recording.phase.log_overflow > 0 {
        recording.phase.log_sha256 = Some(privacy::hex(&recording.hash.finalize()));
    }
    result
}

pub(super) struct Replay<'a> {
    phase: &'a Phase,
    payload: &'a [u8],
    next: usize,
    absent: Option<(u64, usize)>,
}

impl Replay<'_> {
    fn bytes_for(&self, span: &Span) -> Option<&[u8]> {
        let index = span.payload_offset?;
        self.payload.get(index..index.checked_add(span.length)?)
    }
}

impl ReadAt for Replay<'_> {
    fn size(&self) -> u64 {
        self.phase.size
    }

    async fn read_at(&mut self, offset: u64, len: usize) -> scan_core::Result<Vec<u8>> {
        let spans = &self.phase.read_log;
        if let Some(span) = spans.get(self.next)
            && span.offset == offset
            && span.length == len
        {
            self.next += 1;
            if let Some(error) = &span.error {
                return Err(error.as_error());
            }
            if let Some(bytes) = self.bytes_for(span) {
                return Ok(bytes.to_vec());
            }
        }
        // The compact sparse representation also permits a revised parser to
        // split or combine reads already covered by the capture.
        let mut bytes = Vec::with_capacity(len.min(self.payload.len()));
        while bytes.len() < len {
            let at = offset.saturating_add(bytes.len() as u64);
            let found = spans
                .iter()
                .filter_map(|span| {
                    let start = usize::try_from(at.checked_sub(span.offset)?).ok()?;
                    self.bytes_for(span)?
                        .get(start..)
                        .filter(|part| !part.is_empty())
                })
                .max_by_key(|part| part.len());
            if let Some(found) = found {
                bytes.extend_from_slice(&found[..found.len().min(len - bytes.len())]);
            } else {
                self.absent.get_or_insert((offset, len));
                return Err(ScanError::Source(format!(
                    "uncaptured range at {offset} length {len}"
                )));
            }
        }
        Ok(bytes)
    }
}

pub(super) fn replay_phase(
    phase: &Phase,
    data: &[u8],
    mut limits: ScanLimits,
    target: Target<'_>,
) -> Result<Output> {
    limits.byte_budget = phase.budget;
    let mut scan = if phase.run_core {
        let mut source = Replay {
            phase,
            payload: data,
            next: 0,
            absent: None,
        };
        let checks = std::cell::Cell::new(0);
        let expired = || {
            checks.set(checks.get() + 1);
            phase.deadline_check.is_some_and(|at| checks.get() >= at)
        };
        let scan = blocking::scan(&mut source, limits, target, Some(&expired), true);
        if let Some((offset, length)) = source.absent {
            return Err(format!("Kit lacks coverage for offset {offset}, length {length}").into());
        }
        scan
    } else if let Some(error) = &phase.early_error {
        let mut scan = scan_core::ScanResult::new(phase.size);
        scan.set_error(error.as_error());
        scan
    } else {
        return Err("Kit has neither source reads nor an observed transport error".into());
    };
    if phase.fallback_budget_exhausted {
        scan.set_error(ScanError::Budget);
    }
    if phase.stream_deadline {
        scan.set_error(ScanError::WorkLimit("scan deadline reached"));
    }
    let transport = match phase.transport.as_str() {
        "range" => {
            scan.reads += 1;
            scan.bytes_requested += 1;
            scan.bytes_read = scan.bytes_read.max(1);
            Some("range")
        }
        "stream" => {
            scan.reads = 1;
            scan.bytes_read = phase.source_bytes.unwrap_or(0);
            scan.bytes_requested = scan.bytes_read;
            Some("stream")
        }
        _ => None,
    };
    Ok(Output {
        source_etag: phase.source_etag.clone(),
        source_content_type: phase.source_content_type.clone(),
        source_transport: transport,
        ..Output::new(scan)
    })
}

pub(super) fn local(
    path: &std::path::Path,
    limits: ScanLimits,
    target: Target<'_>,
    deadline: Option<Deadline>,
) -> Result<(Output, Capture, u64)> {
    local_with_capture(path, limits, target, deadline, Capture::new(true))
}

pub(super) fn local_with_capture(
    path: &std::path::Path,
    limits: ScanLimits,
    target: Target<'_>,
    deadline: Option<Deadline>,
    mut capture: Capture,
) -> Result<(Output, Capture, u64)> {
    let start = Instant::now();
    let mut input = crate::FileSource::open(path)?;
    let mut phase = Phase {
        transport: "file".into(),
        ..Phase::default()
    };
    let scan = core(
        &mut input,
        limits,
        target,
        deadline,
        &mut capture,
        &mut phase,
    );
    capture.phases.push(phase);
    Ok((
        Output::new(scan),
        capture,
        start.elapsed().as_millis() as u64,
    ))
}

pub(super) fn probe_replay(probe: &HttpEvidence) -> Result<Output> {
    // Replay a response whose headers already make the range probe fail. The
    // HTTP validation path derives the error from the actual recorded status.
    http::replay_probe(probe)
}

pub(super) fn replay_phases(
    phases: &[Phase],
    payload: &[u8],
    limits: ScanLimits,
    target: Target<'_>,
) -> Result<Option<Output>> {
    let mut prior = None::<Output>;
    for phase in phases {
        if phase.transport == "stream"
            && let Some(previous) = &prior
            && !matches!(previous.scan.status, scan_core::Status::SourceError)
        {
            break;
        }
        let mut output = replay_phase(phase, payload, limits, target)?;
        if let Some(previous) = &prior {
            output.scan.bytes_requested += previous.scan.bytes_requested;
            output.scan.reads += previous.scan.reads;
        }
        prior = Some(output);
    }
    Ok(prior)
}

pub(super) fn probe_error_replay(error: &CapturedError) -> Output {
    http::probe_failure(error.as_error())
}

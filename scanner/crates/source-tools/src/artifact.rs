use crate::{
    Candidate, Failure, HttpEvidence,
    connectors::looks_like_html,
    http::{BodyMode, Request, Response, Traffic, Transport, content_range, is_github_asset},
    public_url, recorded_url, sensitive_url,
};
use clap::ValueEnum;
use scan_core::{
    Profile, REMOTE_BUDGET_TIERS, ReadAt, ScanError, ScanLimits, ScanResult, Status, Target,
    scan_target_with_deadline,
};
use serde::{Deserialize, Serialize};
use std::{
    future::Future,
    pin::pin,
    task::{Context, Poll, Waker},
    time::{Duration, Instant},
};
use url::Url;

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize, ValueEnum)]
pub enum Tier {
    #[value(name = "8")]
    #[serde(rename = "8")]
    Small,
    #[value(name = "64")]
    #[serde(rename = "64")]
    Medium,
    #[default]
    #[value(name = "256")]
    #[serde(rename = "256")]
    Large,
}

impl Tier {
    fn count(self) -> usize {
        match self {
            Self::Small => 1,
            Self::Medium => 2,
            Self::Large => 3,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
pub struct ScanOptions {
    pub scan_ranges: bool,
    pub max_tier: Tier,
    pub timeout_secs: u64,
}

impl Default for ScanOptions {
    fn default() -> Self {
        Self {
            scan_ranges: false,
            max_tier: Tier::Large,
            timeout_secs: 120,
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct Probe {
    pub reachable: bool,
    pub method: Option<String>,
    pub status: Option<u16>,
    #[serde(default)]
    pub head_status: Option<u16>,
    pub final_url: Option<String>,
    pub content_length: Option<u64>,
    pub bytes_total: Option<u64>,
    pub accept_ranges: Option<String>,
    pub range_supported: Option<bool>,
    pub etag: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,
}

pub struct Outcome {
    pub probe: Probe,
    pub result: Option<ScanResult>,
    pub failure: Option<Failure>,
    pub evidence: Option<HttpEvidence>,
    pub traffic: Traffic,
    pub attempts: Vec<u64>,
}

struct Representation {
    url: Url,
    size: u64,
    etag: Option<String>,
}

pub fn inspect(transport: &dyn Transport, candidate: &Candidate, options: ScanOptions) -> Outcome {
    let mut outcome = Outcome {
        probe: Probe::default(),
        result: None,
        failure: None,
        evidence: None,
        traffic: Traffic::default(),
        attempts: Vec::new(),
    };
    let deadline = Instant::now() + Duration::from_secs(options.timeout_secs.min(3600));
    let direct = candidate.download_url.as_deref().unwrap_or(&candidate.url);
    let original = match public_url(direct) {
        Ok(url) if !sensitive_url(&url) => url,
        Ok(_) => {
            outcome.failure = Some(Failure::new(
                "needs_login",
                "credential-bearing artifact URL requires a separate workflow",
            ));
            return outcome;
        }
        Err(error) => {
            outcome.failure = Some(error);
            return outcome;
        }
    };
    let representation = match probe(transport, &original, deadline, &mut outcome) {
        Ok(representation) => representation,
        Err(error) => {
            outcome.failure = Some(error);
            return outcome;
        }
    };
    if !options.scan_ranges {
        return outcome;
    }

    for &budget in &REMOTE_BUDGET_TIERS[..options.max_tier.count()] {
        let budget = budget.saturating_sub(if outcome.attempts.is_empty() { 1 } else { 0 });
        let before = outcome.traffic.bytes;
        let mut source = RangeSource {
            transport,
            original: &original,
            representation: &representation,
            deadline,
            budget,
            traffic: &mut outcome.traffic,
            failure: None,
            evidence: &mut outcome.evidence,
            started_bytes: before,
        };
        let limits = ScanLimits {
            byte_budget: budget,
            ..ScanLimits::for_profile(Profile::RemoteCli)
        };
        let expired = || transport.cancelled() || Instant::now() >= deadline;
        let result = ready(scan_target_with_deadline(
            &mut source,
            limits,
            Target::Auto,
            Some(&expired),
        ));
        let timed_out = Instant::now() >= deadline;
        let transport_failed = source.failure.is_some();
        let failure = attempt_failure(
            &result,
            candidate,
            source.failure.take(),
            transport.cancelled(),
            timed_out,
        );
        let should_escalate = failure
            .as_ref()
            .is_some_and(|err| err.class == "budget_hit");
        if !transport_failed
            && !timed_out
            && !transport.cancelled()
            && failure.is_some()
            && !should_escalate
        {
            source.collect_failure_prefix();
        }
        outcome
            .attempts
            .push(budget + u64::from(outcome.attempts.is_empty()));
        outcome.result = Some(result);
        outcome.failure = failure;
        if !should_escalate {
            break;
        }
    }
    outcome
}

fn attempt_failure(
    result: &ScanResult,
    candidate: &Candidate,
    transport: Option<Failure>,
    cancelled: bool,
    timed_out: bool,
) -> Option<Failure> {
    if cancelled {
        Some(Failure::new("cancelled", "run interrupted"))
    } else if timed_out {
        if verified(result) {
            // Core preserves the verified primary and marks interrupted
            // inventory separately. Keep representation failures visible.
            transport.filter(|failure| failure.class != "timeout")
        } else {
            Some(Failure::new("timeout", "candidate deadline reached"))
        }
    } else {
        transport.or_else(|| classify(result, candidate))
    }
}

fn probe(
    transport: &dyn Transport,
    original: &Url,
    deadline: Instant,
    outcome: &mut Outcome,
) -> Result<Representation, Failure> {
    let mut request = Request::new(original.clone(), BodyMode::Range { start: 0, end: 0 });
    request.deadline = Some(deadline);
    let response = transport.fetch(request, &mut outcome.traffic)?;
    outcome.evidence = Some(response.evidence(original));
    let range = response.header("content-range").and_then(content_range);
    let length = response
        .header("content-length")
        .and_then(|length| length.parse().ok());
    outcome.probe = Probe {
        reachable: matches!(response.status, 200..=299),
        method: Some("GET bytes=0-0".into()),
        status: Some(response.status),
        head_status: None,
        final_url: Some(recorded_url(response.url.as_str())),
        content_length: length,
        bytes_total: range
            .map(|(_, _, size)| size)
            .or_else(|| (response.status == 200).then_some(length).flatten()),
        accept_ranges: response.header("accept-ranges").map(str::to_owned),
        range_supported: Some(false),
        etag: response.header("etag").map(str::to_owned),
        filename: response.filename(),
    };
    if matches!(response.status, 400 | 405 | 416)
        && !response.header("allow").is_some_and(|allow| {
            allow
                .split(',')
                .any(|method| method.trim().eq_ignore_ascii_case("POST"))
        })
    {
        let mut head = Request::new(original.clone(), BodyMode::Head);
        head.deadline = Some(deadline);
        if let Ok(headers) = transport.fetch(head, &mut outcome.traffic)
            && (200..300).contains(&headers.status)
            && !is_html(&headers)
        {
            outcome.probe.reachable = true;
            outcome.probe.head_status = Some(headers.status);
            outcome.probe.method = Some("GET bytes=0-0; HEAD".into());
            outcome.probe.content_length = headers
                .header("content-length")
                .and_then(|length| length.parse().ok());
            outcome.probe.bytes_total = outcome.probe.content_length;
            outcome.probe.accept_ranges = headers.header("accept-ranges").map(str::to_owned);
            outcome.probe.etag = headers.header("etag").map(str::to_owned);
            outcome.probe.filename = headers.filename();
            return Err(Failure::new(
                "no_range_support",
                "HEAD succeeded but the range probe was rejected",
            ));
        }
    }
    response.require_success(original)?;
    if is_html(&response) {
        outcome.probe.reachable = false;
        if response.status == 200
            && response.url.host_str() == Some("www.segger.com")
            && response
                .url
                .path()
                .starts_with("/downloads/jlink/JLink_MacOSX_")
            && response.url.path().ends_with(".pkg")
        {
            return Err(Failure::new(
                "needs_attestation",
                "SEGGER J-Link requires license and export-control attestations on the vendor download page",
            ));
        }
        return Err(Failure::new(
            "html_landing_page",
            "artifact endpoint returned HTML",
        ));
    }
    if is_github_asset(&response.url)
        && response
            .header("content-type")
            .is_some_and(|kind| kind.to_ascii_lowercase().contains("json"))
    {
        outcome.probe.reachable = false;
        return Err(Failure::new(
            "github_asset_metadata_only",
            "GitHub returned asset metadata to the binary request",
        ));
    }
    let size = validate_range(&response, 0, 1, None)?;
    outcome.probe.range_supported = Some(true);
    Ok(Representation {
        size,
        etag: strong_etag(&response).map(str::to_owned),
        url: response.url,
    })
}

struct RangeSource<'a> {
    transport: &'a dyn Transport,
    original: &'a Url,
    representation: &'a Representation,
    deadline: Instant,
    budget: u64,
    started_bytes: u64,
    traffic: &'a mut Traffic,
    failure: Option<Failure>,
    evidence: &'a mut Option<HttpEvidence>,
}

impl RangeSource<'_> {
    fn collect_failure_prefix(&mut self) {
        let length = self.size().min(512) as usize;
        let have = self
            .evidence
            .as_ref()
            .map_or(0, |prior| prior.first_bytes_hex.len() / 2);
        if have < length && self.remaining_budget() >= length as u64 {
            // Evidence reads use the same deadline, policy, representation and
            // physical budget. They cannot replace the original parser outcome.
            let _ = ready(self.read_at(0, length));
        }
    }
}

impl ReadAt for RangeSource<'_> {
    fn size(&self) -> u64 {
        self.representation.size
    }

    fn remaining_budget(&self) -> u64 {
        self.budget
            .saturating_sub(self.traffic.bytes - self.started_bytes)
    }

    async fn read_at(&mut self, offset: u64, len: usize) -> scan_core::Result<Vec<u8>> {
        if len == 0 {
            return Ok(Vec::new());
        }
        if len as u64 > self.remaining_budget() {
            return Err(ScanError::Budget);
        }
        if let Some(failure) = &self.failure {
            return Err(ScanError::Source(failure.message.clone()));
        }
        self.fetch_range(offset, len).map_err(|failure| {
            let detail = failure.message.clone();
            self.failure = Some(failure);
            ScanError::Source(detail)
        })
    }
}

impl RangeSource<'_> {
    fn fetch_range(&mut self, offset: u64, len: usize) -> Result<Vec<u8>, Failure> {
        const MAX_RESUMES: usize = 2;
        let end = offset + len as u64 - 1;
        let mut prefix = Vec::new();
        for attempt in 0..=MAX_RESUMES {
            let start = offset + prefix.len() as u64;
            let remaining = len - prefix.len();
            let mut request = Request::new(
                self.representation.url.clone(),
                BodyMode::Range { start, end },
            );
            request.if_match = self.representation.etag.clone();
            request.deadline = Some(self.deadline);
            let response = self.transport.fetch(request, self.traffic)?;
            if !(200..300).contains(&response.status) {
                response.require_success(self.original)?;
            }
            let evidence = |failure: Failure| failure.with_http(response.evidence(self.original));
            if is_html(&response) {
                return Err(evidence(Failure::new(
                    "html_landing_page",
                    "artifact became HTML during range reads",
                )));
            }
            let pinned = self.representation.etag.is_some()
                && self.representation.etag.as_deref() == strong_etag(&response);
            if !prefix.is_empty() && !pinned {
                return Err(evidence(Failure::new(
                    "representation_changed",
                    "artifact size, validator or final URL changed before range resume",
                )));
            }
            let interrupted = response.body.len() < remaining
                && response.read_failure.as_ref().is_none_or(|error| {
                    matches!(error.class.as_str(), "timeout" | "transport_error")
                });
            if attempt < MAX_RESUMES
                && !response.body.is_empty()
                && interrupted
                && pinned
                && !response.too_large
            {
                validate_range_headers(&response, start, remaining, Some(self.representation))
                    .map_err(evidence)?;
                prefix.extend(response.body);
                continue;
            }
            response.require_success(self.original)?;
            validate_range(&response, start, remaining, Some(self.representation))
                .map_err(evidence)?;
            if start == 0
                && self.evidence.as_ref().is_none_or(|before| {
                    before.first_bytes_hex.len() < response.body.len().min(512) * 2
                })
            {
                *self.evidence = Some(response.evidence(self.original));
            }
            if prefix.is_empty() {
                return Ok(response.body);
            }
            prefix.extend(response.body);
            return Ok(prefix);
        }
        unreachable!("last range attempt never resumes")
    }
}

fn strong_etag(response: &Response) -> Option<&str> {
    response
        .header("etag")
        .filter(|value| value.len() >= 2 && value.starts_with('"') && value.ends_with('"'))
}

fn validate_range(
    response: &Response,
    offset: u64,
    len: usize,
    expected: Option<&Representation>,
) -> Result<u64, Failure> {
    let size = validate_range_headers(response, offset, len, expected)?;
    if response.body.len() != len {
        return Err(Failure::new(
            "invalid_range",
            "response body size does not match the requested range",
        ));
    }
    Ok(size)
}

fn validate_range_headers(
    response: &Response,
    offset: u64,
    len: usize,
    expected: Option<&Representation>,
) -> Result<u64, Failure> {
    if response.status != 206 {
        return Err(Failure::new(
            "no_range_support",
            format!("expected 206, received {}", response.status),
        ));
    }
    let (start, stop, size) = response
        .header("content-range")
        .and_then(content_range)
        .ok_or_else(|| Failure::new("invalid_range", "missing or invalid Content-Range"))?;
    if start != offset
        || stop != offset + len as u64 - 1
        || response
            .header("content-length")
            .is_some_and(|v| v.parse() != Ok(len))
        || response
            .header("content-encoding")
            .is_some_and(|value| !value.eq_ignore_ascii_case("identity"))
    {
        return Err(Failure::new(
            "invalid_range",
            "response range, size, or encoding does not match the request",
        ));
    }
    if let Some(expected) = expected
        && (size != expected.size
            || response.url != expected.url
            || expected
                .etag
                .as_deref()
                .zip(response.header("etag"))
                .is_some_and(|(before, after)| before != after))
    {
        return Err(Failure::new(
            "representation_changed",
            "artifact size, validator or final URL changed",
        ));
    }
    Ok(size)
}

fn is_html(response: &Response) -> bool {
    response
        .header("content-type")
        .is_some_and(|value| value.to_ascii_lowercase().starts_with("text/html"))
        || looks_like_html(&response.body[..response.body.len().min(512)])
}

pub fn verified(result: &ScanResult) -> bool {
    matches!(result.status, Status::Complete)
        && !result.architectures.is_empty()
        && result.architectures.iter().all(|arch| arch.header_verified)
        && result.min_macos.is_some()
        && (result.bundle_path.is_none()
            || (result.bundle_id.is_some() && result.version.is_some()))
}

fn classify(result: &ScanResult, candidate: &Candidate) -> Option<Failure> {
    if verified(result) {
        return None;
    }
    let observed = result.error.as_deref().unwrap_or_default();
    let class = match result.status {
        Status::Unsupported | Status::Invalid
            if candidate.format_guess.as_deref() == Some("nar") =>
        {
            "unsupported_container:nar".into()
        }
        Status::NoExecutable => "executable_not_found".into(),
        Status::Script => "script_executable".into(),
        Status::BudgetExhausted => "budget_hit".into(),
        Status::LimitReached => "scan_limit".into(),
        Status::Invalid => "invalid_container".into(),
        Status::Unsupported if !result.nested_artifacts.is_empty() => "nested_container".into(),
        Status::Unsupported if observed.contains("codec") || observed.contains("compression") => {
            "unsupported_codec".into()
        }
        Status::Unsupported => {
            let kind = result
                .format
                .or(candidate.format_guess.as_deref())
                .unwrap_or("unknown");
            let kind = if !kind.is_empty()
                && kind.len() <= 32
                && kind
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-')
            {
                kind
            } else {
                "unknown"
            };
            format!("unsupported_container:{kind}")
        }
        Status::NotFound if !result.nested_artifacts.is_empty() => "nested_container".into(),
        Status::NotFound if observed.contains("plist") || observed.contains("bundle") => {
            "plist_not_found".into()
        }
        Status::NotFound | Status::Complete if result.architectures.is_empty() => {
            "no_macho_found".into()
        }
        Status::NotFound => "executable_not_found".into(),
        Status::SourceError => "transport_error".into(),
        Status::Complete => "metadata_missing".into(),
    };
    Some(Failure::new(
        class,
        if observed.is_empty() {
            "required architecture or bundle metadata is absent"
        } else {
            observed
        },
    ))
}

fn ready<T>(future: impl Future<Output = T>) -> T {
    match pin!(future).poll(&mut Context::from_waker(Waker::noop())) {
        Poll::Ready(result) => result,
        Poll::Pending => unreachable!("blocking ReadAt has no asynchronous I/O"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[test]
    fn completed_primary_survives_a_deadline_during_optional_inventory() {
        struct File(&'static [u8]);
        impl ReadAt for File {
            fn size(&self) -> u64 {
                self.0.len() as u64
            }

            async fn read_at(&mut self, offset: u64, len: usize) -> scan_core::Result<Vec<u8>> {
                Ok(self.0[offset as usize..offset as usize + len].to_vec())
            }
        }

        let fixture = include_bytes!("../../../fixtures/deflated-zip64.zip");
        let result = ready(scan_core::scan(&mut File(fixture), 8192));
        assert!(verified(&result));
        let candidate = Candidate::new(
            "url-list",
            &crate::Seed::default(),
            "https://example.com/fixture.zip",
        )
        .unwrap();
        let timeout = Failure::new("timeout", "request deadline reached");
        let failure = attempt_failure(&result, &candidate, Some(timeout), false, true);
        assert!(failure.is_none(), "{failure:?}");
    }

    struct PartialRange {
        requests: Mutex<Vec<BodyMode>>,
        resumed_etag: &'static str,
    }

    impl Transport for PartialRange {
        fn fetch(&self, request: Request, traffic: &mut Traffic) -> Result<Response, Failure> {
            assert_eq!(request.if_match.as_deref(), Some("\"artifact-v1\""));
            self.requests.lock().unwrap().push(request.mode);
            let (range, expected_len, body, tag, read_failure) = match request.mode {
                BodyMode::Range { start: 8, end: 11 } => (
                    "bytes 8-11/100",
                    "4",
                    b"M".as_slice(),
                    "\"artifact-v1\"",
                    Some(Failure::new(
                        "transport_error",
                        "unable to read HTTP response body",
                    )),
                ),
                BodyMode::Range { start: 9, end: 11 } => (
                    "bytes 9-11/100",
                    "3",
                    b"ach".as_slice(),
                    self.resumed_etag,
                    None,
                ),
                unexpected => panic!("unexpected range {unexpected:?}"),
            };
            traffic.bytes += body.len() as u64;
            traffic.requests += 1;
            Ok(Response {
                url: request.url,
                status: 206,
                headers: [
                    ("content-range".into(), range.into()),
                    ("content-length".into(), expected_len.into()),
                    ("etag".into(), tag.into()),
                ]
                .into(),
                body: body.to_vec(),
                received: body.len(),
                too_large: false,
                read_failure,
            })
        }
    }

    #[test]
    fn resumes_only_the_missing_bytes_of_a_truncated_validated_range() {
        let url = public_url("https://downloads.example.org/artifact.zip").unwrap();
        let representation = Representation {
            url: url.clone(),
            size: 100,
            etag: Some("\"artifact-v1\"".into()),
        };
        for (etag, accepted) in [("\"artifact-v1\"", true), ("\"artifact-v2\"", false)] {
            let fixture = PartialRange {
                requests: Mutex::default(),
                resumed_etag: etag,
            };
            let mut traffic = Traffic::default();
            let mut source = RangeSource {
                transport: &fixture,
                original: &url,
                representation: &representation,
                deadline: Instant::now() + Duration::from_secs(10),
                budget: 4,
                traffic: &mut traffic,
                failure: None,
                evidence: &mut None,
                started_bytes: 0,
            };
            let result = ready(source.read_at(8, 4));
            if accepted {
                assert_eq!(result.unwrap(), b"Mach");
            } else {
                assert!(
                    result
                        .unwrap_err()
                        .to_string()
                        .contains("artifact size, validator or final URL changed")
                );
            }
            assert_eq!(source.remaining_budget(), 0);
            assert_eq!(
                *fixture.requests.lock().unwrap(),
                [
                    BodyMode::Range { start: 8, end: 11 },
                    BodyMode::Range { start: 9, end: 11 },
                ]
            );
        }
    }
}

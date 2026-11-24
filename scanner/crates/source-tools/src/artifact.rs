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
    pub final_url: Option<String>,
    pub content_length: Option<u64>,
    pub bytes_total: Option<u64>,
    pub accept_ranges: Option<String>,
    pub range_supported: Option<bool>,
    pub etag: Option<String>,
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
        let failure = if transport.cancelled() {
            Some(Failure::new("cancelled", "run interrupted"))
        } else if timed_out {
            Some(Failure::new("timeout", "candidate deadline reached"))
        } else {
            source.failure.or_else(|| classify(&result, candidate))
        };
        let should_escalate = failure
            .as_ref()
            .is_some_and(|err| err.class == "budget_hit");
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
        final_url: Some(recorded_url(response.url.as_str())),
        content_length: length,
        bytes_total: range
            .map(|(_, _, size)| size)
            .or_else(|| (response.status == 200).then_some(length).flatten()),
        accept_ranges: response.header("accept-ranges").map(str::to_owned),
        range_supported: Some(false),
        etag: response.header("etag").map(str::to_owned),
    };
    response.require_success(original)?;
    if is_html(&response) {
        outcome.probe.reachable = false;
        return Err(Failure::new(
            "html_landing_page",
            "artifact endpoint returned HTML",
        ));
    }
    if response.status == 200
        && is_github_asset(original)
        && response
            .header("content-type")
            .is_some_and(|kind| kind.contains("json"))
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
        let mut request = Request::new(
            self.representation.url.clone(),
            BodyMode::Range {
                start: offset,
                end: offset + len as u64 - 1,
            },
        );
        request.if_match = self.representation.etag.clone();
        request.deadline = Some(self.deadline);
        let response = self.transport.fetch(request, self.traffic);
        let result = response.and_then(|response| {
            let valid = response.require_success(self.original).and_then(|()| {
                if is_html(&response) {
                    return Err(Failure::new(
                        "html_landing_page",
                        "artifact became HTML during range reads",
                    ));
                }
                validate_range(&response, offset, len, Some(self.representation)).map(|_| ())
            });
            if let Err(error) = valid {
                return Err(error.with_http(response.evidence(self.original)));
            }
            if offset == 0
                && self.evidence.as_ref().is_none_or(|before| {
                    before.first_bytes_hex.len() < response.body.len().min(512) * 2
                })
            {
                *self.evidence = Some(response.evidence(self.original));
            }
            Ok(response.body)
        });
        result.map_err(|failure| {
            let detail = failure.message.clone();
            self.failure = Some(failure);
            ScanError::Source(detail)
        })
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
        || response.body.len() != len
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
                .zip(strong_etag(response))
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

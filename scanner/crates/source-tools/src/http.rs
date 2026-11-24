mod robots;

use crate::{Failure, HttpEvidence, public_url, recorded_url};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    io::{self, Read},
    net::IpAddr,
    sync::{
        Arc, Condvar, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    thread,
    time::{Duration, Instant, SystemTime},
};
use ureq::{
    Agent,
    config::Config,
    http::{Method, Request as WireRequest, Uri},
    unversioned::{
        resolver::{DefaultResolver, ResolvedSocketAddrs, Resolver},
        transport::{DefaultConnector, NextTimeout},
    },
};
use url::Url;

const USER_AGENT: &str = "DoesItARM-SourceTools/0.1";
const TIMEOUT: Duration = Duration::from_secs(12);
const MAX_RETRY_WAIT: Duration = Duration::from_secs(20);
const SNIPPET: usize = 512;
pub const METADATA_LIMIT: usize = 8 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BodyMode {
    Head,
    Metadata(usize),
    Range { start: u64, end: u64 },
    Robots,
}

#[derive(Clone, Debug)]
pub struct Request {
    pub url: Url,
    pub mode: BodyMode,
    pub github_api: bool,
    pub if_none_match: Option<String>,
    pub if_match: Option<String>,
    pub deadline: Option<Instant>,
}

impl Request {
    pub fn new(url: Url, mode: BodyMode) -> Self {
        Self {
            url,
            mode,
            github_api: false,
            if_none_match: None,
            if_match: None,
            deadline: None,
        }
    }
}

#[derive(Debug)]
pub struct Response {
    pub url: Url,
    pub status: u16,
    pub headers: BTreeMap<String, String>,
    pub body: Vec<u8>,
    pub received: usize,
    pub too_large: bool,
    pub read_failure: Option<Failure>,
}

impl Response {
    pub fn header(&self, key: &str) -> Option<&str> {
        self.headers.get(key).map(String::as_str)
    }

    pub fn evidence(&self, original: &Url) -> HttpEvidence {
        let headers = self
            .headers
            .iter()
            .filter(|(key, _)| {
                matches!(
                    key.as_str(),
                    "content-type"
                        | "content-length"
                        | "content-range"
                        | "content-encoding"
                        | "accept-ranges"
                        | "etag"
                        | "retry-after"
                        | "allow"
                        | "x-ratelimit-remaining"
                        | "x-ratelimit-reset"
                )
            })
            .map(|(key, value)| (key.clone(), value.chars().take(256).collect()))
            .collect();
        let snippet = &self.body[..self.body.len().min(SNIPPET)];
        let signed = crate::sensitive_url(&self.url) || crate::sensitive_url(original);
        let text = String::from_utf8_lossy(snippet);
        // CDN error bodies can echo the signed target that produced the error.
        let suppress = (signed && self.status != 206) || mentions_secret(&text);
        let snippet = if suppress { &[] } else { snippet };
        HttpEvidence {
            url: recorded_url(original.as_str()),
            final_url: recorded_url(self.url.as_str()),
            status: Some(self.status),
            headers,
            first_bytes_hex: snippet.iter().map(|byte| format!("{byte:02x}")).collect(),
            first_bytes_text: if suppress {
                "[redacted]".into()
            } else {
                text.chars()
                    .map(|c| {
                        if c.is_control() && !matches!(c, '\n' | '\r' | '\t') {
                            '�'
                        } else {
                            c
                        }
                    })
                    .collect()
            },
        }
    }

    pub fn require_success(&self, original: &Url) -> Result<(), Failure> {
        if (200..300).contains(&self.status) {
            if let Some(failure) = &self.read_failure {
                return Err(failure.clone().with_http(self.evidence(original)));
            }
            if self.too_large {
                return Err(
                    Failure::new("metadata_too_large", "metadata exceeds its byte limit")
                        .with_http(self.evidence(original)),
                );
            }
            return Ok(());
        }
        let class = if rate_limited(self) {
            "rate_limited".into()
        } else if self.status == 401 {
            "needs_login".into()
        } else if self.status == 405
            && self.header("allow").is_some_and(|value| {
                value
                    .split(',')
                    .any(|m| m.trim().eq_ignore_ascii_case("POST"))
            })
        {
            "post_required".into()
        } else {
            format!("http_{}", self.status)
        };
        Err(Failure::new(class, format!("HTTP {}", self.status)).with_http(self.evidence(original)))
    }
}

fn mentions_secret(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    [
        "x-amz-signature",
        "x-goog-signature",
        "access_token",
        "authorization:",
        "bearer ",
        "token=",
        "sig=",
    ]
    .into_iter()
    .any(|part| lower.contains(part))
}

#[derive(Clone, Debug, Default)]
pub struct Traffic {
    pub requests: u64,
    pub bytes: u64,
}

pub trait Transport: Sync {
    fn fetch(&self, request: Request, traffic: &mut Traffic) -> Result<Response, Failure>;
    fn cancelled(&self) -> bool {
        false
    }
}

pub struct Http {
    agent: Agent,
    token: Option<String>,
    cancelled: Arc<AtomicBool>,
    hosts: Mutex<HashMap<String, Arc<Mutex<Host>>>>,
    robots: Mutex<HashMap<String, Arc<Mutex<Option<robots::Robots>>>>>,
    active: Mutex<usize>,
    available: Condvar,
    robots_bytes: AtomicU64,
}

#[derive(Default)]
struct Host {
    next: Option<Instant>,
}

impl Http {
    pub fn new(cancelled: Arc<AtomicBool>, github_token: Option<String>) -> Self {
        let config = Agent::config_builder()
            .http_status_as_error(false)
            .max_redirects(0)
            .max_idle_connections(12)
            .proxy(None)
            .timeout_global(Some(TIMEOUT))
            .build();
        let agent = Agent::with_parts(
            config,
            DefaultConnector::default(),
            PublicResolver::default(),
        );
        Self {
            agent,
            token: github_token,
            cancelled,
            hosts: Mutex::default(),
            robots: Mutex::default(),
            active: Mutex::new(0),
            available: Condvar::new(),
            robots_bytes: AtomicU64::new(0),
        }
    }

    pub fn robots_bytes(&self) -> u64 {
        self.robots_bytes.load(Ordering::Relaxed)
    }

    fn check(&self, deadline: Option<Instant>) -> Result<(), Failure> {
        if self.cancelled() {
            return Err(Failure::new("cancelled", "run interrupted"));
        }
        if deadline.is_some_and(|end| Instant::now() >= end) {
            return Err(Failure::new("timeout", "candidate deadline reached"));
        }
        Ok(())
    }

    fn wait(&self, duration: Duration, deadline: Option<Instant>) -> Result<(), Failure> {
        let until = Instant::now() + duration;
        while Instant::now() < until {
            self.check(deadline)?;
            thread::sleep(
                until
                    .saturating_duration_since(Instant::now())
                    .min(Duration::from_millis(50)),
            );
        }
        self.check(deadline)
    }

    fn slot(&self, deadline: Option<Instant>) -> Result<Slot<'_>, Failure> {
        let mut active = self.active.lock().unwrap();
        while *active >= 2 {
            self.check(deadline)?;
            active = self
                .available
                .wait_timeout(active, Duration::from_millis(50))
                .unwrap()
                .0;
        }
        self.check(deadline)?;
        *active += 1;
        Ok(Slot(self))
    }

    fn robots(&self, url: &Url, deadline: Option<Instant>) -> Result<(), Failure> {
        let origin = url.origin().ascii_serialization();
        let entry = self
            .robots
            .lock()
            .unwrap()
            .entry(origin.clone())
            .or_default()
            .clone();
        let mut cached = entry.lock().unwrap();
        if cached.is_none() {
            let robots_url = Url::parse(&format!("{origin}/robots.txt")).expect("valid origin");
            let mut request = Request::new(robots_url, BodyMode::Robots);
            request.deadline = deadline;
            let mut stats = Traffic::default();
            let result = self.follow(request, &mut stats, false);
            self.robots_bytes.fetch_add(stats.bytes, Ordering::Relaxed);
            let response = result.map_err(|error| match error.class.as_str() {
                "cancelled" | "timeout" => error,
                _ => Failure::new(
                    "robots_unavailable",
                    format!("robots request failed ({})", error.class),
                ),
            })?;
            *cached = Some(match response.status {
                200..=299 if response.read_failure.is_none() && !response.too_large => {
                    robots::Robots::parse(&response.body)
                }
                400..=499 if !rate_limited(&response) => robots::Robots::default(),
                _ => {
                    return Err(Failure::new(
                        "robots_unavailable",
                        format!("robots returned HTTP {}", response.status),
                    ));
                }
            });
        }
        let target = &url[url::Position::BeforePath..];
        if !cached.as_ref().unwrap().allows(target) {
            return Err(Failure::new(
                "robots_disallowed",
                "robots.txt disallows this path",
            ));
        }
        Ok(())
    }

    fn follow(
        &self,
        mut request: Request,
        stats: &mut Traffic,
        obey_robots: bool,
    ) -> Result<Response, Failure> {
        let original = request.url.clone();
        let mut visited = HashSet::new();
        for _ in 0..=8 {
            self.check(request.deadline)?;
            policy(&request.url)?;
            if obey_robots {
                self.robots(&request.url, request.deadline)?;
            }
            if !visited.insert(request.url.clone()) {
                break;
            }
            let response = self.attempt(&request, stats)?;
            if !matches!(response.status, 301 | 302 | 303 | 307 | 308) {
                return Ok(response);
            }
            let parsed = response
                .header("location")
                .and_then(|value| request.url.join(value).ok());
            let destination = parsed.and_then(|url| public_url(url.as_str()).ok());
            let Some(destination) = destination else {
                return Err(Failure::new(
                    "invalid_redirect",
                    "invalid or non-public redirect destination",
                )
                .with_http(response.evidence(&original)));
            };
            if request.url.scheme() == "https" && destination.scheme() != "https" {
                return Err(
                    Failure::new("invalid_redirect", "HTTPS redirect downgraded to HTTP")
                        .with_http(response.evidence(&original)),
                );
            }
            if login_path(&destination) {
                let mut evidence = response.evidence(&original);
                evidence.final_url = recorded_url(destination.as_str());
                return Err(
                    Failure::new("needs_login", "redirect to a sign-in path").with_http(evidence)
                );
            }
            if destination.origin() != request.url.origin() {
                request.github_api = false;
                request.if_none_match = None;
            }
            request.url = destination;
        }
        Err(Failure::new(
            "redirect_loop",
            "redirect loop or more than eight redirects",
        )
        .with_http(HttpEvidence {
            url: recorded_url(original.as_str()),
            final_url: recorded_url(request.url.as_str()),
            ..HttpEvidence::default()
        }))
    }

    fn attempt(&self, request: &Request, stats: &mut Traffic) -> Result<Response, Failure> {
        let key = request
            .url
            .host_str()
            .expect("validated URL")
            .trim_end_matches('.')
            .to_ascii_lowercase();
        let gate = self.hosts.lock().unwrap().entry(key).or_default().clone();
        let mut host = gate.lock().unwrap();
        for attempt in 0..=2 {
            if let Some(next) = host.next {
                let delay = next.saturating_duration_since(Instant::now());
                if delay > MAX_RETRY_WAIT {
                    return Err(Failure::new(
                        "rate_limited",
                        "host is waiting for its rate-limit reset",
                    ));
                }
                self.wait(delay, request.deadline)?;
            }
            let slot = self.slot(request.deadline)?;
            host.next = Some(Instant::now() + Duration::from_millis(1000 + jitter(126)));
            stats.requests += 1;
            let response = self.once(request);
            drop(slot);
            if let Ok(response) = &response {
                stats.bytes += response.received as u64;
                if let Some(delay) = documented_wait(response) {
                    host.next = Some(Instant::now() + delay);
                }
            }
            let retryable = match &response {
                Ok(response) => {
                    rate_limited(response) || matches!(response.status, 408 | 502..=504)
                }
                Err(error) => matches!(error.class.as_str(), "timeout" | "transport_error"),
            };
            if attempt == 2
                || !retryable
                || matches!(request.mode, BodyMode::Range { .. }) && response.is_err()
            {
                return response;
            }
            let backoff = Instant::now() + Duration::from_millis((1000 << attempt) + jitter(251));
            host.next = Some(host.next.map_or(backoff, |next| next.max(backoff)));
            if host.next.unwrap().saturating_duration_since(Instant::now()) > MAX_RETRY_WAIT {
                return response;
            }
        }
        unreachable!("attempt loop always returns")
    }

    fn once(&self, request: &Request) -> Result<Response, Failure> {
        let mut wire = WireRequest::builder()
            .uri(request.url.as_str())
            .method(if request.mode == BodyMode::Head {
                Method::HEAD
            } else {
                Method::GET
            })
            .header("user-agent", USER_AGENT)
            .header("accept-encoding", "identity");
        if request.github_api
            && request.url.scheme() == "https"
            && request.url.host_str() == Some("api.github.com")
        {
            wire = wire
                .header("accept", "application/vnd.github+json")
                .header("x-github-api-version", "2022-11-28");
            if let Some(token) = &self.token {
                wire = wire.header("authorization", format!("Bearer {token}"));
            }
        }
        if let Some(etag) = &request.if_none_match {
            wire = wire.header("if-none-match", etag);
        }
        if let Some(etag) = &request.if_match {
            wire = wire.header("if-match", etag);
        }
        if let BodyMode::Range { start, end } = request.mode {
            wire = wire.header("range", format!("bytes={start}-{end}"));
        }
        let timeout = request
            .deadline
            .map(|end| end.saturating_duration_since(Instant::now()).min(TIMEOUT))
            .unwrap_or(TIMEOUT);
        let wire = wire
            .body(())
            .map_err(|_| Failure::new("invalid_request", "invalid HTTP request headers"))?;
        let wire = self
            .agent
            .configure_request(wire)
            .timeout_global(Some(timeout))
            .build();
        let mut response = self.agent.run(wire).map_err(transport_error)?;
        let status = response.status().as_u16();
        let headers = response
            .headers()
            .iter()
            .filter_map(|(k, v)| Some((k.to_string(), v.to_str().ok()?.to_owned())))
            .collect();
        let mut result = Response {
            url: request.url.clone(),
            status,
            headers,
            body: Vec::new(),
            received: 0,
            too_large: false,
            read_failure: None,
        };
        if let Some(cap) = body_limit(request.mode, &result) {
            let mut reader = response.body_mut().as_reader();
            let (limit, sniff) = match cap {
                BodyLimit::Exact(size) => (size, false),
                BodyLimit::Metadata(size) => (size + 1, true),
            };
            if sniff {
                read_counted(
                    &mut reader,
                    &mut result,
                    limit.min(SNIPPET),
                    &self.cancelled,
                );
                if !metadata_text(&result.body) {
                    result.read_failure = Some(Failure::new(
                        "unexpected_metadata",
                        "metadata endpoint returned binary data",
                    ));
                    return Ok(result);
                }
            }
            read_counted(&mut reader, &mut result, limit, &self.cancelled);
            if sniff && result.body.len() == limit {
                result.body.truncate(limit - 1);
                result.too_large = true;
            }
        }
        Ok(result)
    }
}

impl Transport for Http {
    fn fetch(&self, request: Request, traffic: &mut Traffic) -> Result<Response, Failure> {
        self.follow(request, traffic, true)
    }

    fn cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Relaxed)
    }
}

struct Slot<'a>(&'a Http);

impl Drop for Slot<'_> {
    fn drop(&mut self) {
        *self.0.active.lock().unwrap() -= 1;
        self.0.available.notify_one();
    }
}

fn jitter(bound: u64) -> u64 {
    u64::from(
        SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .subsec_nanos(),
    ) % bound
}

fn rate_limited(response: &Response) -> bool {
    response.status == 429
        || response.status == 403
            && (response.header("x-ratelimit-remaining") == Some("0")
                || response.header("retry-after").is_some())
}

fn documented_wait(response: &Response) -> Option<Duration> {
    if let Some(value) = response.header("retry-after") {
        let seconds = value.parse::<u64>().ok().map(Duration::from_secs);
        let date = httpdate::parse_http_date(value)
            .ok()
            .map(|date| date.duration_since(SystemTime::now()).unwrap_or_default());
        return seconds
            .or(date)
            .map(|delay| delay.min(Duration::from_secs(86400)));
    }
    if response.header("x-ratelimit-remaining") == Some("0") {
        return response
            .header("x-ratelimit-reset")?
            .parse::<u64>()
            .ok()
            .and_then(|s| SystemTime::UNIX_EPOCH.checked_add(Duration::from_secs(s)))
            .map(|time| {
                time.duration_since(SystemTime::now())
                    .unwrap_or_default()
                    .min(Duration::from_secs(86400))
            });
    }
    None
}

fn transport_error(error: ureq::Error) -> Failure {
    match error {
        ureq::Error::Timeout(_) => Failure::new("timeout", "HTTP request timed out"),
        ureq::Error::HostNotFound => Failure::new(
            "dns_unavailable",
            "hostname did not resolve to a public address",
        ),
        _ => Failure::new("transport_error", "HTTP connection, TLS or protocol error"),
    }
}

enum BodyLimit {
    Exact(usize),
    Metadata(usize),
}

fn body_limit(mode: BodyMode, response: &Response) -> Option<BodyLimit> {
    if mode == BodyMode::Head || matches!(response.status, 301 | 302 | 303 | 304 | 307 | 308) {
        return None;
    }
    let textual = response.header("content-type").is_some_and(|value| {
        value.starts_with("text/") || value.contains("json") || value.contains("xml")
    });
    if !(200..300).contains(&response.status) {
        return textual.then_some(BodyLimit::Exact(SNIPPET));
    }
    if response
        .header("content-encoding")
        .is_some_and(|v| !v.eq_ignore_ascii_case("identity"))
    {
        return None;
    }
    match mode {
        BodyMode::Head => None,
        BodyMode::Robots => Some(BodyLimit::Metadata(512 * 1024)),
        BodyMode::Metadata(limit) => {
            let kind = response.header("content-type").unwrap_or_default();
            if kind.starts_with("text/html")
                || !textual
                    && !matches!(
                        kind.split(';').next().unwrap_or_default(),
                        "" | "application/octet-stream"
                            | "application/yaml"
                            | "application/x-yaml"
                            | "application/x-plist"
                    )
            {
                return Some(BodyLimit::Exact(SNIPPET));
            }
            Some(BodyLimit::Metadata(limit))
        }
        BodyMode::Range { start, end } if response.status == 206 => {
            let (first, last, _) = response.header("content-range").and_then(content_range)?;
            let size = usize::try_from(end.checked_sub(start)?.checked_add(1)?).ok()?;
            (first == start
                && last == end
                && response
                    .header("content-length")
                    .is_none_or(|v| v.parse::<usize>() == Ok(size)))
            .then_some(BodyLimit::Exact(size))
        }
        BodyMode::Range { .. } => textual.then_some(BodyLimit::Exact(SNIPPET)),
    }
}

fn read_counted(
    reader: &mut impl Read,
    response: &mut Response,
    limit: usize,
    cancel: &AtomicBool,
) {
    let mut buffer = [0; 16 * 1024];
    while response.body.len() < limit && response.read_failure.is_none() {
        if cancel.load(Ordering::Relaxed) {
            response.read_failure = Some(Failure::new("cancelled", "run interrupted"));
            break;
        }
        let cap = buffer.len().min(limit - response.body.len());
        match reader.read(&mut buffer[..cap]) {
            Ok(0) => break,
            Ok(count) => {
                response.received += count;
                response.body.extend_from_slice(&buffer[..count]);
            }
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(error) => {
                response.read_failure = Some(
                    if matches!(
                        error.kind(),
                        io::ErrorKind::TimedOut | io::ErrorKind::WouldBlock
                    ) {
                        Failure::new("timeout", "HTTP response body timed out")
                    } else {
                        Failure::new("transport_error", "unable to read HTTP response body")
                    },
                );
            }
        }
    }
}

fn metadata_text(prefix: &[u8]) -> bool {
    let prefix = prefix.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(prefix);
    prefix.starts_with(b"bplist00")
        || valid_utf8_prefix(prefix)
            && prefix
                .iter()
                .all(|b| !b.is_ascii_control() || matches!(b, b'\n' | b'\r' | b'\t'))
}

fn valid_utf8_prefix(bytes: &[u8]) -> bool {
    match std::str::from_utf8(bytes) {
        Ok(_) => true,
        Err(error) => error.error_len().is_none(),
    }
}

pub fn content_range(value: &str) -> Option<(u64, u64, u64)> {
    let (unit, rest) = value.split_once(' ')?;
    if !unit.eq_ignore_ascii_case("bytes") {
        return None;
    }
    let (range, size) = rest.split_once('/')?;
    let (start, end) = range.split_once('-')?;
    let number = |digits: &str| {
        digits
            .bytes()
            .all(|b| b.is_ascii_digit())
            .then(|| digits.parse::<u64>().ok())
            .flatten()
    };
    let (start, end, size) = (number(start)?, number(end)?, number(size)?);
    (start <= end && end < size).then_some((start, end, size))
}

fn login_path(url: &Url) -> bool {
    let path = url.path().trim_end_matches('/').to_ascii_lowercase();
    [
        "/login",
        "/sign-in",
        "/signin",
        "/oauth/authorize",
        "/account/signin",
    ]
    .iter()
    .any(|end| path.ends_with(end))
}

fn policy(url: &Url) -> Result<(), Failure> {
    let host = url.host_str().unwrap_or_default().trim_end_matches('.');
    let blocked = [
        "itch.io",
        "steampowered.com",
        "gog.com",
        "epicgames.com",
        "apps.apple.com",
        "itunes.apple.com",
        "developer.apple.com",
        "macupdate.com",
        "appagg.com",
        "alternativeto.net",
        "gumroad.com",
        "fastspring.com",
        "paddle.com",
        "setapp.com",
    ];
    if blocked.iter().any(|domain| {
        host == *domain
            || host
                .strip_suffix(domain)
                .is_some_and(|part| part.ends_with('.'))
    }) {
        return Err(Failure::new(
            "source_policy",
            "research limits this host to separate permissioned or discovery-only workflows",
        ));
    }
    Ok(())
}

#[derive(Debug, Default)]
struct PublicResolver(DefaultResolver);

impl Resolver for PublicResolver {
    fn resolve(
        &self,
        uri: &Uri,
        config: &Config,
        timeout: NextTimeout,
    ) -> Result<ResolvedSocketAddrs, ureq::Error> {
        let found = self.0.resolve(uri, config, timeout)?;
        let mut public = self.empty();
        for address in found.iter().filter(|ip| public_ip(ip.ip())) {
            public.push(*address);
        }
        if public.is_empty() {
            return Err(ureq::Error::HostNotFound);
        }
        Ok(public)
    }
}

fn public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            let [a, b, c, _] = ip.octets();
            !matches!(
                (a, b, c),
                (0 | 10 | 127 | 224..=255, _, _)
                    | (100, 64..=127, _)
                    | (169, 254, _)
                    | (172, 16..=31, _)
                    | (192, 0, 0 | 2)
                    | (192, 168, _)
                    | (198, 18 | 19, _)
                    | (198, 51, 100)
                    | (203, 0, 113)
            )
        }
        IpAddr::V6(ip) => {
            let [first, second, ..] = ip.segments();
            first & 0xe000 == 0x2000
                && first != 0x2002
                && !(first == 0x2001 && (second <= 0x01ff || second == 0xdb8))
        }
    }
}

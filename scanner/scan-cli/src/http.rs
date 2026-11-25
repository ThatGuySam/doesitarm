#[cfg(test)]
use super::ready;
use super::{Deadline, Output, blocking, failure, source_error};
use crate::ledger::capture::{self, Capture, HttpEvidence, Phase};
use scan_core::{Profile, ReadAt, Result, ScanError, ScanLimits, ScanResult, Target};
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom, Write},
    thread,
    time::{Duration, Instant},
};
use ureq::{
    Agent, Body, BodyReader, ResponseExt,
    http::{HeaderValue, Response, Uri, header},
};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
const DEADLINE: ScanError = ScanError::WorkLimit("scan deadline reached");

#[derive(Default)]
pub(crate) struct Options {
    pub(crate) allow_stream: bool,
    pub(crate) allow_http: bool,
    pub(crate) delay: Duration,
    pub(crate) spool_dir: Option<std::path::PathBuf>,
}

pub(crate) fn scan(
    url: &str,
    limits: ScanLimits,
    target: Target<'_>,
    options: &Options,
    deadline: Option<Deadline>,
) -> Output {
    scan_with_capture(url, limits, target, options, deadline, None)
}

pub(crate) fn scan_with_capture(
    url: &str,
    mut limits: ScanLimits,
    target: Target<'_>,
    options: &Options,
    deadline: Option<Deadline>,
    mut capture: Option<&mut Capture>,
) -> Output {
    if deadline.is_some_and(Deadline::expired) {
        return Output::new(failure(DEADLINE, 0));
    }
    if limits.byte_budget == 0 {
        return Output::new(failure(ScanError::Budget, 0));
    }
    let config = Agent::config_builder()
        .http_status_as_error(false)
        .https_only(!options.allow_http)
        .max_redirects(8)
        .save_redirect_history(capture.is_some())
        .timeout_global(Some(REQUEST_TIMEOUT))
        .build();
    let agent = Agent::new_with_config(config);
    let uri = match url.parse::<Uri>() {
        Ok(uri) if uri.host().is_some() && !uri.authority().unwrap().as_str().contains('@') => uri,
        _ => return Output::new(failure(ScanError::Source("invalid HTTP URL".into()), 0)),
    };
    let now = Instant::now();
    let response = match request(&agent, &uri, 0, 1, None, deadline) {
        Ok(response) => response,
        Err(error) => {
            if let Some(trace) = capture {
                trace.probe_error(&error);
            }
            return probe_failure(error);
        }
    };
    if let Some(trace) = capture.as_deref_mut() {
        trace.probe_response(&response);
    }
    if response.status().as_u16() == 200 && options.allow_stream {
        return scan_stream(response, limits, target, deadline, options, capture);
    }
    let (probe, magic) = match accept_range(response, 0, 1, None) {
        Ok(response) => response,
        Err(_) if deadline.is_some_and(Deadline::expired) => return probe_failure(DEADLINE),
        Err(error) => {
            if let Some(trace) = capture {
                trace.probe_error(&error);
            }
            return probe_failure(error);
        }
    };
    if let Some(trace) = capture.as_deref_mut() {
        trace.prefix(0, &magic);
    }
    let source_etag = etag_text(probe.etag.as_ref());
    let mut source = HttpSource {
        agent,
        representation: probe,
        delay: options.delay,
        last_request: now,
        deadline,
        ignored_range: None,
        observe: capture.is_some(),
        last_response: None,
    };
    let budget = if limits.profile == Profile::Worker {
        limits.byte_budget.min(source.size().saturating_sub(1))
    } else {
        limits.byte_budget
    };
    limits.byte_budget = budget.saturating_sub(1);
    let mut phase = Phase {
        transport: "range".into(),
        source_etag: source_etag.clone(),
        ..Phase::default()
    };
    let mut result = if let Some(trace) = capture.as_deref_mut() {
        capture::core(&mut source, limits, target, deadline, trace, &mut phase)
    } else {
        scan_core(&mut source, limits, target, deadline)
    };
    phase.response = source.last_response.take();
    result.reads += 1;
    result.bytes_requested += 1;
    // A successful core read of the magic already covers the probe at zero.
    result.bytes_read = result.bytes_read.max(1);
    if options.allow_stream
        && matches!(result.status, scan_core::Status::SourceError)
        && let Some(response) = source.ignored_range.take()
    {
        limits.byte_budget = budget.saturating_sub(result.bytes_requested);
        if limits.byte_budget == 0 {
            result.set_error(ScanError::Budget);
            phase.fallback_budget_exhausted = true;
        } else {
            if let Some(trace) = capture.as_deref_mut() {
                phase.restarted = true;
                trace.phases.push(phase);
            }
            let mut restarted = scan_stream(response, limits, target, deadline, options, capture);
            restarted.scan.bytes_requested += result.bytes_requested;
            restarted.scan.reads += result.reads;
            return restarted;
        }
    }
    if let Some(trace) = capture {
        trace.phases.push(phase);
    }
    Output {
        source_etag,
        source_transport: Some("range"),
        ..Output::new(result)
    }
}

pub(crate) fn replay_probe(probe: &HttpEvidence) -> capture::ReplayResult<Output> {
    let mut response = Response::builder().status(probe.status);
    for (name, value) in &probe.headers {
        response = response.header(name, value);
    }
    // No body is needed for rejection by status. Header validation of a
    // successful 206 would require the original probe body and response URI.
    if probe.status == 206 {
        return Err("HTTP 206 probe requires bytes or a parser phase".into());
    }
    match accept_range(response.body(Body::builder().data(b""))?, 0, 1, None) {
        Err(error) => Ok(probe_failure(error)),
        Ok(_) => Err("Recorded HTTP probe was accepted".into()),
    }
}

fn probe_failure(error: ScanError) -> Output {
    let mut scan = failure(error, 1);
    scan.bytes_requested = 1;
    Output::new(scan)
}

fn scan_core(
    source: &mut impl ReadAt,
    limits: ScanLimits,
    target: Target<'_>,
    deadline: Option<Deadline>,
) -> ScanResult {
    let expired = || deadline.is_some_and(Deadline::expired);
    blocking::scan(
        source,
        limits,
        target,
        deadline.map(|_| &expired as &dyn Fn() -> bool),
        false,
    )
}

fn scan_stream(
    response: Response<Body>,
    mut limits: ScanLimits,
    target: Target<'_>,
    deadline: Option<Deadline>,
    options: &Options,
    mut capture: Option<&mut Capture>,
) -> Output {
    let source_etag = etag_text(
        response
            .headers()
            .get(header::ETAG)
            .filter(|tag| is_strong(tag)),
    );
    let source_content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.chars().take(128).collect());
    let mut phase = Phase {
        transport: "stream".into(),
        source_etag: source_etag.clone(),
        source_content_type: source_content_type.clone(),
        response: capture
            .as_ref()
            .map(|_| HttpEvidence::from_response(&response)),
        ..Phase::default()
    };
    let result =
        match StreamSource::open_in(response, limits.byte_budget, options.spool_dir.as_deref()) {
            Ok(mut source) => {
                let mut result = match source.discover_size() {
                    Ok(()) => {
                        // The spool meters physical transfer. Reads served from it
                        // can revisit cached bytes without a second network charge.
                        limits.byte_budget = u64::MAX;
                        if let Some(trace) = capture.as_deref_mut() {
                            capture::core(&mut source, limits, target, deadline, trace, &mut phase)
                        } else {
                            scan_core(&mut source, limits, target, deadline)
                        }
                    }
                    Err(error) => {
                        phase.size = source.size();
                        phase.early_error = Some((&error).into());
                        let mut result = ScanResult::new(source.size());
                        result.set_error(error);
                        result
                    }
                };
                if deadline.is_some_and(Deadline::expired) {
                    phase.stream_deadline = true;
                    result.set_error(DEADLINE);
                }
                phase.source_bytes = Some(source.received);
                result.reads = 1;
                result.bytes_read = source.received;
                result.bytes_requested = source.received;
                result
            }
            Err(error) => {
                phase.early_error = Some((&error).into());
                failure(error, 1)
            }
        };
    if let Some(trace) = capture {
        trace.phases.push(phase);
    }
    Output {
        source_etag,
        source_transport: Some("stream"),
        source_content_type,
        ..Output::new(result)
    }
}

fn etag_text(tag: Option<&HeaderValue>) -> Option<String> {
    tag.and_then(|value| value.to_str().ok()).map(str::to_owned)
}

/// A single unseekable response can back random reads from the prefix it has
/// already delivered. The spool is anonymous and lives only for this scan.
struct StreamSource {
    body: BodyReader<'static>,
    spool: File,
    size: Option<u64>,
    received: u64,
    budget: u64,
}

impl StreamSource {
    #[cfg(test)]
    fn open(response: Response<Body>, budget: u64) -> Result<Self> {
        Self::open_in(response, budget, None)
    }

    fn open_in(
        response: Response<Body>,
        budget: u64,
        spool_dir: Option<&std::path::Path>,
    ) -> Result<Self> {
        require_identity(response.headers(), "stream")?;
        let size = response
            .headers()
            .get(header::CONTENT_LENGTH)
            .map(|value| {
                value
                    .to_str()
                    .ok()
                    .and_then(|text| text.parse().ok())
                    .ok_or_else(|| source_error("stream: invalid Content-Length"))
            })
            .transpose()?;
        if let Some(range) = response.headers().get(header::CONTENT_RANGE) {
            let reported = range.to_str().ok().and_then(content_range);
            let whole = reported.is_some_and(|(start, stop, total)| {
                start == 0 && stop + 1 == total && size == Some(total)
            });
            if !whole {
                return Err(source_error(
                    "stream: HTTP 200 supplied a partial Content-Range",
                ));
            }
        }
        Ok(Self {
            body: response.into_body().into_reader(),
            spool: spool_dir
                .map_or_else(tempfile::tempfile, tempfile::tempfile_in)
                .map_err(source_error)?,
            size,
            received: 0,
            budget,
        })
    }

    fn discover_size(&mut self) -> Result<()> {
        if self.size.is_none() {
            self.receive_until(self.budget)?;
            if self.size.is_none() {
                return Err(ScanError::Budget);
            }
        }
        Ok(())
    }

    fn receive_until(&mut self, end: u64) -> Result<()> {
        if end > self.budget {
            return Err(ScanError::Budget);
        }
        if end <= self.received {
            return Ok(());
        }
        self.spool
            .seek(SeekFrom::Start(self.received))
            .map_err(source_error)?;
        let mut buffer = [0; 32 * 1024];
        while self.received < end {
            let count = (end - self.received).min(buffer.len() as u64) as usize;
            let read = self.body.read(&mut buffer[..count]).map_err(source_error)?;
            if read == 0 {
                if self.size.is_some_and(|size| self.received < size) {
                    return Err(source_error("stream: body ended before Content-Length"));
                }
                self.size = Some(self.received);
                break;
            }
            self.received += read as u64;
            self.spool
                .write_all(&buffer[..read])
                .map_err(source_error)?;
        }
        Ok(())
    }
}

impl ReadAt for StreamSource {
    fn size(&self) -> u64 {
        self.size.unwrap_or(0)
    }

    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>> {
        let end = offset
            .checked_add(len as u64)
            .filter(|end| *end <= self.size())
            .ok_or(ScanError::Invalid("range outside streamed response"))?;
        self.receive_until(end)?;
        let mut bytes = vec![0; len];
        self.spool
            .seek(SeekFrom::Start(offset))
            .map_err(source_error)?;
        self.spool.read_exact(&mut bytes).map_err(source_error)?;
        Ok(bytes)
    }
}

struct Representation {
    uri: Uri,
    size: u64,
    etag: Option<HeaderValue>,
}

struct HttpSource {
    agent: Agent,
    representation: Representation,
    delay: Duration,
    last_request: Instant,
    deadline: Option<Deadline>,
    ignored_range: Option<Response<Body>>,
    observe: bool,
    last_response: Option<HttpEvidence>,
}

impl ReadAt for HttpSource {
    fn size(&self) -> u64 {
        self.representation.size
    }

    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>> {
        let delay = self.delay.saturating_sub(self.last_request.elapsed());
        thread::sleep(
            self.deadline
                .map_or(delay, |deadline| delay.min(deadline.remaining())),
        );
        self.last_request = Instant::now();
        let response = request(
            &self.agent,
            &self.representation.uri,
            offset,
            len,
            Some(&self.representation),
            self.deadline,
        )?;
        if self.observe {
            self.last_response = Some(HttpEvidence::from_response(&response));
        }
        if response.status().as_u16() == 200 {
            self.ignored_range = Some(response);
            return Err(source_error(format!(
                "range {offset}-{}: HTTP 200 OK (expected 206)",
                offset + len as u64 - 1
            )));
        }
        let (representation, bytes) =
            accept_range(response, offset, len, Some(&self.representation)).map_err(|error| {
                if self.deadline.is_some_and(Deadline::expired) {
                    DEADLINE
                } else {
                    error
                }
            })?;
        self.representation = representation;
        Ok(bytes)
    }
}

fn request(
    agent: &Agent,
    uri: &Uri,
    offset: u64,
    len: usize,
    expected: Option<&Representation>,
    deadline: Option<Deadline>,
) -> Result<Response<Body>> {
    let end = offset + len as u64 - 1;
    let mut request = agent
        .get(uri)
        .header(header::RANGE, format!("bytes={offset}-{end}"))
        .header(header::ACCEPT_ENCODING, "identity")
        .header(header::USER_AGENT, "DoesItARM-Scanner/0.1");
    if let Some(etag) = expected.and_then(|value| value.etag.as_ref()) {
        request = request.header(header::IF_MATCH, etag);
    }
    if let Some(deadline) = deadline {
        let remaining = deadline.remaining();
        if remaining.is_zero() {
            return Err(DEADLINE);
        }
        request = request
            .config()
            .timeout_global(Some(remaining.min(REQUEST_TIMEOUT)))
            .build();
    }
    request.call().map_err(|error| {
        if deadline.is_some_and(Deadline::expired) {
            DEADLINE
        } else {
            source_error(error)
        }
    })
}

fn accept_range(
    mut response: Response<Body>,
    offset: u64,
    len: usize,
    expected: Option<&Representation>,
) -> Result<(Representation, Vec<u8>)> {
    let end = offset + len as u64 - 1;
    let label = format!("range {offset}-{end}");
    if response.status().as_u16() != 206 {
        return Err(source_error(format!(
            "{label}: HTTP {} (expected 206)",
            response.status()
        )));
    }

    let headers = response.headers();
    require_identity(headers, &label)?;

    let declared = headers
        .get(header::CONTENT_RANGE)
        .and_then(|value| value.to_str().ok());
    let (start, stop, size) = declared
        .and_then(content_range)
        .ok_or_else(|| source_error(format!("{label}: missing or invalid Content-Range")))?;
    if start != offset || stop != end {
        return Err(source_error(format!(
            "{label}: server returned bytes {start}-{stop}/{size}"
        )));
    }
    if expected.is_some_and(|value| value.size != size) {
        return Err(source_error(format!(
            "{label}: representation size changed"
        )));
    }
    if let Some(length) = headers.get(header::CONTENT_LENGTH)
        && length.to_str().ok().and_then(|text| text.parse().ok()) != Some(len)
    {
        return Err(source_error(format!("{label}: invalid Content-Length")));
    }

    let observed = headers
        .get(header::ETAG)
        .filter(|value| is_strong(value))
        .cloned();
    let validator = expected.and_then(|value| value.etag.as_ref());
    if let (Some(before), Some(now)) = (validator, &observed)
        && before != now
    {
        return Err(source_error(format!("{label}: strong ETag changed")));
    }
    let representation = Representation {
        uri: response.get_uri().clone(),
        size,
        etag: observed.or_else(|| validator.cloned()),
    };

    let mut bytes = Vec::with_capacity(len);
    response
        .body_mut()
        .as_reader()
        .take(len as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| source_error(format!("{label}: {error}")))?;
    if bytes.len() != len {
        return Err(source_error(format!(
            "{label}: received {} bytes, expected {len}",
            bytes.len()
        )));
    }
    Ok((representation, bytes))
}

fn require_identity(headers: &ureq::http::HeaderMap, label: &str) -> Result<()> {
    if headers
        .get(header::CONTENT_ENCODING)
        .is_some_and(|value| !value.as_bytes().eq_ignore_ascii_case(b"identity"))
    {
        return Err(source_error(format!(
            "{label}: unexpected Content-Encoding"
        )));
    }
    Ok(())
}

fn is_strong(value: &HeaderValue) -> bool {
    let text = value.as_bytes();
    text.len() >= 2 && text.starts_with(b"\"") && text.ends_with(b"\"")
}

fn content_range(value: &str) -> Option<(u64, u64, u64)> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{BufRead, BufReader, Write},
        net::TcpListener,
        thread,
    };

    fn exchange(reply: &'static str) -> (Result<(Representation, Vec<u8>)>, String) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url: Uri = format!("http://{}/test", listener.local_addr().unwrap())
            .parse()
            .unwrap();
        let server = thread::spawn(move || {
            let (mut conn, _) = listener.accept().unwrap();
            let mut request = String::new();
            let mut reader = BufReader::new(&mut conn);
            loop {
                let mut line = String::new();
                if reader.read_line(&mut line).unwrap() == 0 || line == "\r\n" {
                    break;
                }
                request.push_str(&line);
            }
            conn.write_all(reply.as_bytes()).unwrap();
            request.to_ascii_lowercase()
        });
        let agent = Agent::new_with_config(
            Agent::config_builder()
                .proxy(None)
                .http_status_as_error(false)
                .timeout_global(Some(Duration::from_secs(2)))
                .build(),
        );
        let planned = Representation {
            uri: url.clone(),
            size: 100,
            etag: Some(HeaderValue::from_static("\"abc\"")),
        };
        (
            request(&agent, &url, 8, 4, Some(&planned), None)
                .and_then(|response| accept_range(response, 8, 4, Some(&planned))),
            server.join().unwrap(),
        )
    }

    #[test]
    fn uses_an_absolute_range_and_validates_the_response() {
        let (result, request) = exchange(
            "HTTP/1.1 206 Partial Content\r\nContent-Range: bytes 8-11/100\r\nETag: \"abc\"\r\nContent-Length: 4\r\nConnection: close\r\n\r\nMach",
        );
        assert_eq!(result.unwrap().1, b"Mach");
        assert!(request.contains("range: bytes=8-11"));
        assert!(request.contains("if-match: \"abc\""));
        assert!(request.contains("accept-encoding: identity"));
    }

    #[test]
    fn rejects_whole_wrong_and_changed_representation_responses() {
        for reply in [
            "HTTP/1.1 200 OK\r\nContent-Length: 1000\r\nConnection: close\r\n\r\n",
            "HTTP/1.1 206 Partial Content\r\nContent-Range: bytes 9-12/100\r\nContent-Length: 4\r\n\r\nMach",
            "HTTP/1.1 206 Partial Content\r\nContent-Range: bytes 8-11/101\r\nContent-Length: 4\r\n\r\nMach",
            "HTTP/1.1 206 Partial Content\r\nContent-Range: bytes 8-11/100\r\nETag: \"new\"\r\nContent-Length: 4\r\n\r\nMach",
            "HTTP/1.1 206 Partial Content\r\nContent-Range: bytes 8-11/100\r\nContent-Length: 4\r\n\r\nX",
        ] {
            assert!(matches!(exchange(reply).0, Err(ScanError::Source(_))));
        }
    }

    #[test]
    fn rejects_unknown_totals_and_invalid_intervals() {
        assert_eq!(content_range("bytes 0-0/*"), None);
        assert_eq!(content_range("bytes 7-0/100"), None);
        assert_eq!(content_range("bytes 1-100/100"), None);
        assert_eq!(content_range("bytes +0-0/100"), None);
    }

    fn whole_response(body: &'static [u8], length: Option<u64>) -> Response<Body> {
        let mut response = Response::builder().status(200);
        if let Some(length) = length {
            response = response.header(header::CONTENT_LENGTH, length);
        }
        response.body(Body::builder().data(body)).unwrap()
    }

    #[test]
    fn stream_scans_a_prefix_and_reuses_bytes_for_backward_reads() {
        let artifact = include_bytes!("../../fixtures/app.tar.gz");
        let result = scan_stream(
            whole_response(artifact, Some(artifact.len() as u64)),
            ScanLimits::new(68 * 1024),
            Target::Auto,
            None,
            &Options::default(),
            None,
        );
        assert!(matches!(result.scan.status, scan_core::Status::Complete));
        assert_eq!(result.source_transport, Some("stream"));
        assert_eq!(result.scan.reads, 1);
        assert!(result.scan.bytes_read < artifact.len() as u64);

        let mut source = StreamSource::open(whole_response(b"Mach-O", Some(6)), 5).unwrap();
        assert_eq!(ready(source.read_at(2, 2)).unwrap(), b"ch");
        assert_eq!(ready(source.read_at(0, 2)).unwrap(), b"Ma");
        assert!(matches!(
            ready(source.read_at(4, 2)),
            Err(ScanError::Budget)
        ));
        assert_eq!(source.received, 4);
    }

    #[test]
    fn stream_discovers_unknown_length_only_within_budget() {
        let mut source = StreamSource::open(whole_response(b"data", None), 5).unwrap();
        source.discover_size().unwrap();
        assert_eq!(source.size(), 4);
        assert_eq!(ready(source.read_at(0, 4)).unwrap(), b"data");

        let mut source = StreamSource::open(whole_response(b"data", None), 3).unwrap();
        assert!(matches!(source.discover_size(), Err(ScanError::Budget)));
        assert_eq!(source.received, 3);
    }
}

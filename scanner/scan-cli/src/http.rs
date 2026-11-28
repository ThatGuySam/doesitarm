use super::{Deadline, Output, failure, ready, source_error};
use scan_core::{
    Profile, ReadAt, Result, ScanError, ScanLimits, ScanResult, Target, scan_target_with_deadline,
};
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
}

pub(crate) fn scan(
    url: &str,
    limits: ScanLimits,
    target: Target<'_>,
    options: &Options,
    deadline: Option<Deadline>,
) -> Output {
    let config = Agent::config_builder()
        .http_status_as_error(false)
        .https_only(!options.allow_http)
        .max_redirects(8)
        .timeout_global(Some(REQUEST_TIMEOUT))
        .build();
    scan_with_agent(
        Agent::new_with_config(config),
        url,
        limits,
        target,
        options,
        deadline,
    )
}

fn scan_with_agent(
    agent: Agent,
    url: &str,
    mut limits: ScanLimits,
    target: Target<'_>,
    options: &Options,
    deadline: Option<Deadline>,
) -> Output {
    if deadline.is_some_and(Deadline::expired) {
        return Output::new(failure(DEADLINE, 0));
    }
    if limits.byte_budget == 0 {
        return Output::new(failure(ScanError::Budget, 0));
    }
    let uri = match url.parse::<Uri>() {
        Ok(uri) if uri.host().is_some() && !uri.authority().unwrap().as_str().contains('@') => uri,
        _ => return Output::new(failure(ScanError::Source("invalid HTTP URL".into()), 0)),
    };
    let mut requests = RangeRequests {
        agent,
        delay: options.delay,
        deadline,
        last_request: None,
        retry_used: limits.profile == Profile::Worker,
        retry_bytes: 0,
    };
    let response = match requests.get(&uri, 0, 1, None) {
        Ok(response) => response,
        Err(error) => return probe_failure(error, 1, 1, &mut requests),
    };
    if response.status().as_u16() == 200 && options.allow_stream {
        return scan_stream(response, limits, target, deadline, Some(requests));
    }

    let check_text_probe = limits.profile != Profile::Worker
        && limits.byte_budget >= 5
        && response
            .headers()
            .get(header::CONTENT_TYPE)
            .is_some_and(|value| {
                value
                    .to_str()
                    .ok()
                    .and_then(|value| value.split(';').next())
                    .is_some_and(|media| media.trim().eq_ignore_ascii_case("text/plain"))
            });
    let (mut probe, _) = match accept_range(response, 0, 1, None) {
        Ok(response) => response,
        Err(error) => return probe_failure(error, 1, 1, &mut requests),
    };
    let mut probe_len = 1;
    let mut probe_reads = 1;
    let mut probe_cost = 1;
    if check_text_probe && probe.size >= 4 {
        // Some intermediaries return a one-byte range of a text response before
        // redirecting to the installer. Establish the representation from a
        // fresh range that can contain the complete archive magic.
        probe_reads += 1;
        probe_cost += 4;
        let corroborated = requests
            .get(&probe.uri, 0, 4, None)
            .and_then(|reply| accept_range(reply, 0, 4, None));
        match corroborated {
            Ok((representation, _)) => {
                probe = representation;
                probe_len = 4;
            }
            Err(error) => return probe_failure(error, probe_reads, probe_cost, &mut requests),
        }
    }

    let mut source = HttpSource {
        requests,
        representation: probe,
        ignored_range: None,
    };
    let budget = if limits.profile == Profile::Worker {
        limits.byte_budget.min(source.size().saturating_sub(1))
    } else {
        limits.byte_budget
    };
    limits.byte_budget = budget.saturating_sub(probe_cost);
    let mut result = scan_core(&mut source, limits, target, deadline);
    let (extra_reads, extra_requested) = source.requests.take_retry_counts();
    result.reads += probe_reads + extra_reads;
    result.bytes_requested += probe_cost + extra_requested;
    result.bytes_read = result.bytes_read.max(probe_len);
    if options.allow_stream
        && matches!(result.status, scan_core::Status::SourceError)
        && let Some(response) = source.ignored_range.take()
    {
        limits.byte_budget = budget.saturating_sub(result.bytes_requested);
        if let Err(error) = validate_stream_fallback(&response, &source.representation) {
            result.set_error(error);
        } else if limits.byte_budget == 0 {
            result.set_error(ScanError::Budget);
        } else {
            let mut restarted =
                scan_stream(response, limits, target, deadline, Some(source.requests));
            restarted.scan.bytes_requested += result.bytes_requested;
            restarted.scan.reads += result.reads;
            return restarted;
        }
    }
    Output {
        source_etag: etag_text(source.representation.etag.as_ref()),
        source_transport: Some("range"),
        ..Output::new(result)
    }
}

fn probe_failure(error: ScanError, reads: u64, bytes: u64, requests: &mut RangeRequests) -> Output {
    let error = if requests.deadline.is_some_and(Deadline::expired) {
        DEADLINE
    } else {
        error
    };
    let (extra_reads, extra_requested) = requests.take_retry_counts();
    let mut scan = failure(error, reads + extra_reads);
    scan.bytes_requested = bytes + extra_requested;
    Output::new(scan)
}

fn scan_core(
    source: &mut impl ReadAt,
    limits: ScanLimits,
    target: Target<'_>,
    deadline: Option<Deadline>,
) -> ScanResult {
    let expired = || deadline.is_some_and(Deadline::expired);
    ready(scan_target_with_deadline(
        source,
        limits,
        target,
        deadline.map(|_| &expired as &dyn Fn() -> bool),
    ))
}

fn scan_stream(
    response: Response<Body>,
    mut limits: ScanLimits,
    target: Target<'_>,
    deadline: Option<Deadline>,
    mut requests: Option<RangeRequests>,
) -> Output {
    let etag = response
        .headers()
        .get(header::ETAG)
        .filter(|tag| is_strong(tag))
        .cloned();
    let source_etag = etag_text(etag.as_ref());
    let source_content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.chars().take(128).collect());
    let resume_uri = requests.as_ref().map(|_| response.get_uri().clone());
    let result = match StreamSource::open(response, limits.byte_budget) {
        Ok(mut source) => {
            if let (Some(uri), Some(size), Some(etag)) = (resume_uri, source.size, etag)
                && let Some(requests) = requests.take()
            {
                source.resume = Some(StreamResume {
                    requests,
                    representation: Representation {
                        uri,
                        size,
                        etag: Some(etag),
                    },
                    attempts: 0,
                    last_offset: 0,
                });
            }
            let mut result = match source.discover_size() {
                Ok(()) => {
                    // The spool meters physical transfer. Reads served from it
                    // can revisit cached bytes without a second network charge.
                    limits.byte_budget = u64::MAX;
                    scan_core(&mut source, limits, target, deadline)
                }
                Err(error) => {
                    let mut result = ScanResult::new(source.size());
                    result.set_error(error);
                    result
                }
            };
            if deadline.is_some_and(Deadline::expired) {
                result.set_error(DEADLINE);
            }
            let resume_attempts = source.resume.as_ref().map_or(0, |resume| resume.attempts);
            let (retry_reads, retry_bytes) = source
                .resume
                .as_mut()
                .map(|resume| &mut resume.requests)
                .or(requests.as_mut())
                .map_or((0, 0), RangeRequests::take_retry_counts);
            result.reads = 1 + resume_attempts + retry_reads;
            result.bytes_read = source.received;
            result.bytes_requested = source.received + retry_bytes;
            result
        }
        Err(error) => failure(error, 1),
    };
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
    resume: Option<StreamResume>,
}

struct StreamResume {
    requests: RangeRequests,
    representation: Representation,
    attempts: u64,
    last_offset: u64,
}

impl StreamSource {
    fn open(response: Response<Body>, budget: u64) -> Result<Self> {
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
            spool: tempfile::tempfile().map_err(source_error)?,
            size,
            received: 0,
            budget,
            resume: None,
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
            let read = match self.body.read(&mut buffer[..count]) {
                Ok(0) if self.size.is_none() => {
                    self.size = Some(self.received);
                    break;
                }
                Ok(0) => {
                    self.resume_at(source_error("stream: body ended before Content-Length"))?;
                    continue;
                }
                Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(error) => {
                    self.resume_at(source_error(error))?;
                    continue;
                }
                Ok(read) => read,
            };
            self.received += read as u64;
            self.spool
                .write_all(&buffer[..read])
                .map_err(source_error)?;
        }
        Ok(())
    }

    fn resume_at(&mut self, error: ScanError) -> Result<()> {
        const MAX_RESUMES: u64 = 2;
        let Some(resume) = &mut self.resume else {
            return Err(error);
        };
        if resume.attempts >= MAX_RESUMES || self.received <= resume.last_offset {
            return Err(error);
        }
        let expected = &resume.representation;
        let len = usize::try_from(expected.size - self.received)
            .map_err(|_| source_error("remaining stream range is too large"))?;
        resume.attempts += 1;
        resume.last_offset = self.received;
        let response = resume
            .requests
            .get(&expected.uri, self.received, len, Some(expected))?;
        range_headers(&response, self.received, len, Some(expected))?;
        if response.get_uri() != &expected.uri
            || response.headers().get(header::ETAG) != expected.etag.as_ref()
        {
            return Err(source_error(
                "stream resume: representation URL or ETag changed",
            ));
        }
        self.body = response.into_body().into_reader();
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
    requests: RangeRequests,
    representation: Representation,
    ignored_range: Option<Response<Body>>,
}

impl ReadAt for HttpSource {
    fn size(&self) -> u64 {
        self.representation.size
    }

    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>> {
        let response = self.requests.get(
            &self.representation.uri,
            offset,
            len,
            Some(&self.representation),
        )?;
        if response.status().as_u16() == 200 {
            self.ignored_range = Some(response);
            return Err(source_error(format!(
                "range {offset}-{}: HTTP 200 OK (expected 206)",
                offset + len as u64 - 1
            )));
        }
        let (representation, bytes) =
            accept_range(response, offset, len, Some(&self.representation)).map_err(|error| {
                if self.requests.deadline.is_some_and(Deadline::expired) {
                    DEADLINE
                } else {
                    error
                }
            })?;
        self.representation = representation;
        Ok(bytes)
    }
}

struct RangeRequests {
    agent: Agent,
    delay: Duration,
    deadline: Option<Deadline>,
    last_request: Option<Instant>,
    retry_used: bool,
    retry_bytes: u64,
}

impl RangeRequests {
    fn get(
        &mut self,
        uri: &Uri,
        offset: u64,
        len: usize,
        expected: Option<&Representation>,
    ) -> Result<Response<Body>> {
        if let Some(last) = self.last_request {
            self.wait(self.delay.saturating_sub(last.elapsed()));
        }
        self.last_request = Some(Instant::now());
        let response = request(&self.agent, uri, offset, len, expected, self.deadline)?;
        let backoff = self.delay.max(Duration::from_millis(250));
        if response.status().as_u16() != 500
            || self.retry_used
            || response.headers().contains_key(header::RETRY_AFTER)
            || self
                .deadline
                .is_some_and(|deadline| deadline.remaining() <= backoff)
        {
            return Ok(response);
        }
        self.retry_used = true;
        self.retry_bytes = len as u64;
        drop(response);
        self.wait(backoff);
        self.last_request = Some(Instant::now());
        request(&self.agent, uri, offset, len, expected, self.deadline)
    }

    fn wait(&self, duration: Duration) {
        thread::sleep(
            self.deadline
                .map_or(duration, |deadline| duration.min(deadline.remaining())),
        );
    }

    fn take_retry_counts(&mut self) -> (u64, u64) {
        let bytes = std::mem::take(&mut self.retry_bytes);
        (u64::from(bytes != 0), bytes)
    }
}

fn validate_stream_fallback(response: &Response<Body>, expected: &Representation) -> Result<()> {
    if response.get_uri() != &expected.uri {
        return Err(source_error("stream fallback: representation URL changed"));
    }
    let headers = response.headers();
    if headers.get(header::CONTENT_LENGTH).is_some_and(|length| {
        length.to_str().ok().and_then(|text| text.parse().ok()) != Some(expected.size)
    }) {
        return Err(source_error("stream fallback: representation size changed"));
    }
    if expected
        .etag
        .as_ref()
        .zip(headers.get(header::ETAG))
        .is_some_and(|(before, after)| before != after)
    {
        return Err(source_error("stream fallback: representation ETag changed"));
    }
    Ok(())
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
    let representation = range_headers(&response, offset, len, expected)?;
    let end = offset + len as u64 - 1;
    let label = format!("range {offset}-{end}");
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

fn range_headers(
    response: &Response<Body>,
    offset: u64,
    len: usize,
    expected: Option<&Representation>,
) -> Result<Representation> {
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
    if let (Some(before), Some(now)) = (validator, headers.get(header::ETAG))
        && before != now
    {
        return Err(source_error(format!("{label}: strong ETag changed")));
    }
    Ok(Representation {
        uri: response.get_uri().clone(),
        size,
        etag: observed.or_else(|| validator.cloned()),
    })
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

#[cfg(test)]
mod recorded;

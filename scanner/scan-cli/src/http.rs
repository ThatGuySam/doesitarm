use super::{Output, failure, ready, source_error};
use scan_core::{ReadAt, Result, ScanError, scan as scan_core};
use std::{io::Read, time::Duration};
use ureq::{
    Agent, ResponseExt,
    http::{HeaderValue, Uri, header},
};

pub(crate) fn scan(url: &str, budget: u64) -> Output {
    if budget == 0 {
        return Output {
            scan: failure(ScanError::Budget, 0),
            source_etag: None,
        };
    }
    let config = Agent::config_builder()
        .http_status_as_error(false)
        .https_only(true)
        .max_redirects(8)
        .timeout_global(Some(Duration::from_secs(15)))
        .build();
    let agent = Agent::new_with_config(config);
    let uri = match url.parse::<Uri>() {
        Ok(uri) if uri.host().is_some() && !uri.authority().unwrap().as_str().contains('@') => uri,
        _ => {
            return Output {
                scan: failure(ScanError::Source("invalid HTTPS URL".into()), 0),
                source_etag: None,
            };
        }
    };
    let (probe, _) = match get(&agent, &uri, 0, 1, None) {
        Ok(response) => response,
        Err(error) => {
            return Output {
                scan: failure(error, 1),
                source_etag: None,
            };
        }
    };
    let source_etag = probe
        .etag
        .as_ref()
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    let mut source = HttpSource {
        agent,
        representation: probe,
    };
    let size = source.size();
    // Keep at least one byte outside the retrieval budget for any remote
    // artifact with more than one byte. The one-byte probe discovers size.
    let remaining = budget.min(size.saturating_sub(1)).saturating_sub(1);
    let mut result = ready(scan_core(&mut source, remaining));
    result.reads += 1;
    result.bytes_read += 1;
    Output {
        scan: result,
        source_etag,
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
}

impl ReadAt for HttpSource {
    fn size(&self) -> u64 {
        self.representation.size
    }

    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>> {
        let (response, bytes) = get(
            &self.agent,
            &self.representation.uri,
            offset,
            len,
            Some(&self.representation),
        )?;
        self.representation = response;
        Ok(bytes)
    }
}

fn get(
    agent: &Agent,
    uri: &Uri,
    offset: u64,
    len: usize,
    expected: Option<&Representation>,
) -> Result<(Representation, Vec<u8>)> {
    let end = offset + len as u64 - 1;
    let mut request = agent
        .get(uri)
        .header(header::RANGE, format!("bytes={offset}-{end}"))
        .header(header::ACCEPT_ENCODING, "identity")
        .header(header::USER_AGENT, "DoesItARM-Scanner/0.1");
    if let Some(etag) = expected.and_then(|value| value.etag.as_ref()) {
        request = request.header(header::IF_MATCH, etag);
    }
    let mut response = request.call().map_err(source_error)?;
    let label = format!("range {offset}-{end}");
    if response.status().as_u16() != 206 {
        return Err(source_error(format!(
            "{label}: HTTP {} (expected 206)",
            response.status()
        )));
    }

    let headers = response.headers();
    if headers
        .get(header::CONTENT_ENCODING)
        .is_some_and(|value| !value.as_bytes().eq_ignore_ascii_case(b"identity"))
    {
        return Err(source_error(format!(
            "{label}: unexpected Content-Encoding"
        )));
    }

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
            get(&agent, &url, 8, 4, Some(&planned)),
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
}

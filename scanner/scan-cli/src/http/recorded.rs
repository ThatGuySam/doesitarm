use super::*;
use std::{
    fmt,
    sync::{Arc, Mutex},
};
use ureq::unversioned::{
    resolver::DefaultResolver,
    transport::{Buffers, ConnectionDetails, Connector, LazyBuffers, NextTimeout, Transport},
};

type Reply = dyn Fn(&str) -> Vec<u8> + Send + Sync;

#[derive(Clone)]
struct Fixture(Arc<Reply>);

impl fmt::Debug for Fixture {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("recorded HTTP responses")
    }
}

impl Connector for Fixture {
    type Out = FixtureTransport;

    fn connect(
        &self,
        _: &ConnectionDetails<'_>,
        _: Option<()>,
    ) -> std::result::Result<Option<Self::Out>, ureq::Error> {
        Ok(Some(FixtureTransport {
            fixture: self.clone(),
            buffers: LazyBuffers::new(1024, 1024),
            request: String::new(),
            response: None,
        }))
    }
}

#[derive(Debug)]
struct FixtureTransport {
    fixture: Fixture,
    buffers: LazyBuffers,
    request: String,
    response: Option<std::io::Cursor<Vec<u8>>>,
}

impl Transport for FixtureTransport {
    fn buffers(&mut self) -> &mut dyn Buffers {
        &mut self.buffers
    }

    fn transmit_output(
        &mut self,
        n: usize,
        _: NextTimeout,
    ) -> std::result::Result<(), ureq::Error> {
        self.request
            .push_str(std::str::from_utf8(&self.buffers.output()[..n]).unwrap());
        Ok(())
    }

    fn await_input(&mut self, _: NextTimeout) -> std::result::Result<bool, ureq::Error> {
        let response = self.response.get_or_insert_with(|| {
            std::io::Cursor::new((self.fixture.0)(&self.request.to_ascii_lowercase()))
        });
        let count = response.read(self.buffers.input_append_buf()).unwrap();
        self.buffers.input_appended(count);
        Ok(count != 0)
    }

    fn is_open(&mut self) -> bool {
        false
    }
}

fn fixture_scan(reply: impl Fn(&str) -> Vec<u8> + Send + Sync + 'static) -> Output {
    let agent = Agent::with_parts(
        Agent::config_builder()
            .proxy(None)
            .http_status_as_error(false)
            .build(),
        Fixture(Arc::new(reply)),
        DefaultResolver::default(),
    );
    scan_with_agent(
        agent,
        "http://127.0.0.1/artifact.zip",
        ScanLimits {
            byte_budget: 1024 * 1024,
            ..ScanLimits::for_profile(Profile::RemoteCli)
        },
        Target::Auto,
        &Options {
            allow_stream: true,
            ..Options::default()
        },
        None,
    )
}

const ZIP: &[u8] = include_bytes!("../../../fixtures/stored.zip");

fn reply(status: &str, headers: &str, bytes: &[u8]) -> Vec<u8> {
    let mut wire = format!("HTTP/1.1 {status}\r\nConnection: close\r\n{headers}\r\n").into_bytes();
    wire.extend(bytes);
    wire
}

fn interval(request: &str) -> (usize, usize) {
    let (start, end) = request
        .lines()
        .find_map(|line| line.strip_prefix("range: bytes="))
        .unwrap()
        .split_once('-')
        .unwrap();
    (start.parse().unwrap(), end.parse().unwrap())
}

fn valid_range(start: usize, end: usize) -> Vec<u8> {
    reply(
        "206 Partial Content",
        &format!(
            "Content-Range: bytes {start}-{end}/{}\r\nContent-Length: {}\r\nETag: \"recorded\"\r\nContent-Type: application/zip\r\n",
            ZIP.len(),
            end - start + 1
        ),
        &ZIP[start..=end],
    )
}

#[test]
fn corroborates_a_text_probe_before_using_its_artifact_size() {
    let output = fixture_scan(|request| {
        let (start, end) = interval(request);
        if (start, end) == (0, 0) {
            return reply(
                "206 Partial Content",
                "Content-Range: bytes 0-0/67\r\nContent-Length: 1\r\nContent-Type: text/plain; charset=utf-8\r\n",
                b"R",
            );
        }
        valid_range(start, end)
    });
    assert!(
        matches!(output.scan.status, scan_core::Status::Complete),
        "{:?}",
        output.scan.error
    );
    assert_eq!(output.scan.total_size, ZIP.len() as u64);
    assert!(!output.scan.architectures.is_empty());
    assert!(
        output
            .scan
            .architectures
            .iter()
            .all(|arch| arch.header_verified)
    );
}

#[test]
fn resumes_a_truncated_stream_with_the_same_length_and_validator() {
    let requests = Arc::new(Mutex::new(Vec::new()));
    let wire = requests.clone();
    let cut = 20;
    let output = fixture_scan(move |request| {
        let (start, end) = interval(request);
        wire.lock().unwrap().push((start, end));
        if (start, end) == (0, 0) {
            return reply(
                "200 OK",
                &format!("Content-Length: {}\r\nETag: \"recorded\"\r\n", ZIP.len()),
                &ZIP[..cut],
            );
        }
        assert!(request.contains("if-match: \"recorded\""));
        valid_range(start, end)
    });
    assert!(
        matches!(output.scan.status, scan_core::Status::Complete),
        "{:?}",
        output.scan.error
    );
    assert_eq!(*requests.lock().unwrap(), [(0, 0), (cut, ZIP.len() - 1)]);
    assert_eq!(output.scan.bytes_requested, ZIP.len() as u64);
}

#[test]
fn rejects_whole_file_fallback_when_the_representation_has_changed() {
    for (length, tag, reason) in [
        (ZIP.len(), "\"changed\"", "ETag changed"),
        (ZIP.len() + 5, "\"recorded\"", "size changed"),
    ] {
        let output = fixture_scan(move |request| {
            let (start, end) = interval(request);
            if (start, end) == (0, 0) {
                return valid_range(start, end);
            }
            reply(
                "200 OK",
                &format!("Content-Length: {length}\r\nETag: {tag}\r\n"),
                ZIP,
            )
        });
        assert!(matches!(output.scan.status, scan_core::Status::SourceError));
        assert!(output.scan.error.unwrap().contains(reason));
        assert!(output.scan.architectures.is_empty());
    }
}

#[test]
fn retries_a_single_origin_500_without_changing_the_requested_range() {
    let failed = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let did_fail = failed.clone();
    let output = fixture_scan(move |request| {
        let (start, end) = interval(request);
        if (start, end) == (0, 3) && !failed.swap(true, std::sync::atomic::Ordering::Relaxed) {
            return reply("500 Internal Server Error", "Content-Length: 0\r\n", b"");
        }
        valid_range(start, end)
    });
    assert!(did_fail.load(std::sync::atomic::Ordering::Relaxed));
    assert!(
        matches!(output.scan.status, scan_core::Status::Complete),
        "{:?}",
        output.scan.error
    );
}

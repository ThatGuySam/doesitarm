use page_resolver::{
    Decision, Document, Headers, Kind, MAX_DOCUMENT_BYTES, MAX_METADATA_BYTES, public_url, resolve,
    unresolved_record,
};
use std::{
    collections::BTreeSet,
    ffi::OsString,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    net::IpAddr,
    path::{Path, PathBuf},
    process::ExitCode,
    time::{Duration, Instant},
};
use ureq::{
    Agent,
    config::Config,
    http::Uri,
    unversioned::{
        resolver::{DefaultResolver, ResolvedSocketAddrs, Resolver},
        transport::{DefaultConnector, NextTimeout},
    },
};
use url::Url;

pub const USAGE: &str = "Usage: scan-cli resolve <page-url> [--html FILE] [--metadata FILE --metadata-url URL] [--ledger FILE]";

type PageResult<T> = Result<T, Box<dyn std::error::Error>>;

#[derive(Debug)]
struct PublicResolver(DefaultResolver);

impl Resolver for PublicResolver {
    fn resolve(
        &self,
        uri: &Uri,
        config: &Config,
        timeout: NextTimeout,
    ) -> Result<ResolvedSocketAddrs, ureq::Error> {
        let addresses = self.0.resolve(uri, config, timeout)?;
        if addresses.iter().all(|addr| public_ip(addr.ip())) {
            Ok(addresses)
        } else {
            Err(ureq::Error::HostNotFound)
        }
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
                    | (192, 31, 196)
                    | (192, 52, 193)
                    | (192, 88, 99)
                    | (192, 168, _)
                    | (192, 175, 48)
                    | (198, 18 | 19, _)
                    | (198, 51, 100)
                    | (203, 0, 113)
            )
        }
        IpAddr::V6(ip) => {
            let [a, b, c, ..] = ip.segments();
            (0x2000..=0x3fff).contains(&a)
                && !(a == 0x2001 && (b < 0x0200 || b == 0x0db8))
                && !matches!(a, 0x2002 | 0x3fff)
                && (a, b, c) != (0x2620, 0x004f, 0x8000)
        }
    }
}

struct Capture {
    url: Url,
    bytes: Vec<u8>,
    status: Option<u16>,
    content_type: String,
    link: String,
}

impl Capture {
    fn document(&self) -> Document<'_> {
        Document {
            url: &self.url,
            bytes: &self.bytes,
            headers: Headers {
                status: self.status,
                content_type: Some(&self.content_type),
                link: Some(&self.link),
            },
        }
    }
}

fn bounded(mut reader: impl Read, max: usize) -> PageResult<Vec<u8>> {
    let mut body = Vec::new();
    reader
        .by_ref()
        .take(max as u64 + 1)
        .read_to_end(&mut body)?;
    if body.len() > max {
        return Err("The page exceeded its size limit.".into());
    }
    Ok(body)
}

fn fetch_document(
    agent: &Agent,
    mut url: Url,
    max: usize,
    expires: Instant,
) -> PageResult<Capture> {
    let mut visited = BTreeSet::new();
    for hop in 0..=3 {
        if !visited.insert(url.clone()) {
            return Err("Redirect loop.".into());
        }
        let available = expires.saturating_duration_since(Instant::now());
        if available.is_zero() {
            return Err("Page resolution timed out.".into());
        }
        let mut response = agent
            .get(url.as_str())
            .header("Accept-Encoding", "identity")
            .header("User-Agent", "DoesItARM-Scanner/0.1")
            .config()
            .timeout_global(Some(available.min(Duration::from_secs(5))))
            .build()
            .call()?;
        let status = response.status().as_u16();
        let headers = response.headers();
        if matches!(status, 301 | 302 | 303 | 307 | 308) {
            if hop == 3 {
                return Err("Page reached the redirect limit.".into());
            }
            url = headers
                .get("Location")
                .and_then(|value| value.to_str().ok())
                .and_then(|value| public_url(value, Some(&url)))
                .ok_or("Redirect requires a public HTTPS hostname.")?;
            continue;
        }
        let content_type = headers
            .get("Content-Type")
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .to_ascii_lowercase();
        let link = headers
            .get("Link")
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .to_owned();
        let mode = content_type.split(';').next().unwrap_or("").trim();
        let allowed = matches!(
            mode,
            "text/html"
                | "application/xhtml+xml"
                | "application/json"
                | "text/plain"
                | "application/xml"
                | "text/xml"
                | "application/rss+xml"
                | "application/atom+xml"
                | "text/yaml"
                | "application/yaml"
                | "application/x-yaml"
        );
        if status == 200 && !allowed {
            return Err("The URL did not return a supported page or feed.".into());
        }
        if headers
            .get("Content-Encoding")
            .is_some_and(|value| !value.as_bytes().eq_ignore_ascii_case(b"identity"))
            || headers
                .get("Content-Length")
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.parse::<usize>().ok())
                .is_some_and(|len| len > max)
        {
            return Err("The page exceeded its size or encoding limit.".into());
        }
        let bytes = if status == 200 {
            bounded(response.body_mut().as_reader(), max)?
        } else {
            Vec::new()
        };
        return Ok(Capture {
            url,
            bytes,
            status: Some(status),
            content_type,
            link,
        });
    }
    unreachable!("the redirect loop is bounded")
}

struct Arguments {
    url: Url,
    html: Option<PathBuf>,
    metadata: Option<(PathBuf, Url)>,
    ledger: Option<PathBuf>,
}

fn parse(args: impl Iterator<Item = OsString>) -> PageResult<Arguments> {
    let mut args = args;
    let url = args
        .next()
        .and_then(|url| public_url(url.to_str()?, None))
        .ok_or("Provide a public HTTPS download page URL.")?;
    let mut html = None;
    let mut meta = None;
    let mut meta_url = None;
    let mut ledger = None;
    while let Some(option) = args.next() {
        let value = args.next().ok_or("Expected a value after each option.")?;
        match option.to_str() {
            Some("--html") if html.is_none() => html = Some(value.into()),
            Some("--metadata") if meta.is_none() => meta = Some(value.into()),
            Some("--metadata-url") if meta_url.is_none() => {
                meta_url = Some(
                    public_url(value.to_str().ok_or("Invalid metadata URL.")?, None)
                        .ok_or("Invalid metadata URL.")?,
                )
            }
            Some("--ledger") if ledger.is_none() => ledger = Some(value.into()),
            _ => return Err("Unknown or repeated option.".into()),
        }
    }
    let metadata = match (meta, meta_url) {
        (Some(path), Some(url)) => Some((path, url)),
        (None, None) => None,
        _ => return Err("Specify --metadata and --metadata-url together.".into()),
    };
    Ok(Arguments {
        url,
        html,
        metadata,
        ledger,
    })
}

fn fixture(path: &Path, url: Url, limit: usize, content_type: &str) -> PageResult<Capture> {
    Ok(Capture {
        url,
        bytes: bounded(File::open(path)?, limit)?,
        status: Some(200),
        content_type: content_type.to_owned(),
        link: String::new(),
    })
}

fn write_record(path: &Path, record: &serde_json::Value) -> PageResult<()> {
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        fs::create_dir_all(parent)?;
    }
    let mut line = serde_json::to_vec(record)?;
    line.push(b'\n');
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)?
        .write_all(&line)?;
    Ok(())
}

fn run(args: Arguments) -> PageResult<bool> {
    let agent = Agent::with_parts(
        Agent::config_builder()
            .https_only(true)
            .proxy(None)
            .max_redirects(0)
            .http_status_as_error(false)
            .timeout_recv_body(Some(Duration::from_secs(2)))
            .build(),
        DefaultConnector::default(),
        PublicResolver(DefaultResolver::default()),
    );
    let expires = Instant::now() + Duration::from_secs(10);
    let capture = match &args.html {
        Some(path) => fixture(path, args.url, MAX_DOCUMENT_BYTES, "text/html")?,
        None => fetch_document(&agent, args.url, MAX_DOCUMENT_BYTES, expires)?,
    };
    let document = capture.document();
    let mut resolution = resolve(document, None);
    let mut secondary = match args.metadata {
        Some((path, url)) => Some((
            fixture(&path, url.clone(), MAX_METADATA_BYTES, "application/json")?,
            url,
        )),
        None => None,
    };
    if secondary.is_none() && args.html.is_none() && resolution.decision == Decision::NeedsApi {
        if let Some(candidate) = resolution.candidates.iter().find(|candidate| {
            matches!(candidate.kind, Kind::Feed | Kind::ReleaseApi)
                || candidate.kind == Kind::Redirect
                    && candidate.url.host_str() == document.url.host_str()
        }) {
            if let Ok(capture) =
                fetch_document(&agent, candidate.url.clone(), MAX_METADATA_BYTES, expires)
            {
                secondary = Some((capture, candidate.url.clone()));
            }
        }
    }
    if let Some((secondary, declared)) = &secondary {
        let mut metadata = secondary.document();
        if metadata
            .headers
            .content_type
            .is_some_and(|value| value.starts_with("text/html"))
        {
            let discovered = resolve(metadata, None);
            if matches!(
                discovered.decision,
                Decision::Resolved | Decision::Ambiguous | Decision::Gated
            ) {
                resolution = discovered;
            }
        } else if metadata.headers.status == Some(200) {
            metadata.url = declared;
            resolution = resolve(document, Some(metadata));
        }
    }
    let mut output = serde_json::to_value(&resolution)?;
    if matches!(
        resolution.decision,
        Decision::None | Decision::Ambiguous | Decision::NeedsApi
    ) {
        let record = unresolved_record(document, &resolution, false);
        let ledger = args.ledger.or_else(|| {
            args.html
                .is_none()
                .then(|| {
                    std::env::var_os("HOME").map(PathBuf::from).map(|home| {
                        home.join("Code/doesitarm-data/scan-ledger/page-attempts.jsonl")
                    })
                })
                .flatten()
        });
        if let Some(path) = ledger {
            write_record(&path, &record)?;
        }
        output["unresolved_page"] = record;
    }
    println!("{}", serde_json::to_string_pretty(&output)?);
    Ok(resolution.decision == Decision::Resolved)
}

pub fn command(args: impl Iterator<Item = OsString>) -> ExitCode {
    match parse(args) {
        Ok(args) => match run(args) {
            Ok(true) => ExitCode::SUCCESS,
            Ok(false) => ExitCode::FAILURE,
            Err(_) => {
                eprintln!(
                    "The page could not be read within the public HTTPS and document limits."
                );
                ExitCode::FAILURE
            }
        },
        Err(error) => {
            eprintln!("{error}\n{USAGE}");
            ExitCode::from(2)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn resolver_rejects_special_address_ranges() {
        for addr in [
            "127.0.0.1",
            "169.254.169.254",
            "100.64.1.1",
            "192.0.0.9",
            "192.31.196.1",
            "192.52.193.1",
            "192.175.48.1",
            "198.18.0.1",
            "::1",
            "::ffff:8.8.8.8",
            "fc00::1",
            "2001:db8::1",
            "2002::1",
            "2620:4f:8000::1",
            "3fff::1",
        ] {
            assert!(!public_ip(addr.parse().unwrap()), "{addr}");
        }
        assert!(public_ip("8.8.8.8".parse().unwrap()));
        assert!(public_ip("2606:4700::1111".parse().unwrap()));
    }
}

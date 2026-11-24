mod autopkg;
mod electron;
mod github;
mod installomator;
mod sparkle;
mod tauri;
mod url_list;
mod yaml;

use crate::{
    AnyResult, Candidate, Failure, Seed, atomic,
    http::{BodyMode, METADATA_LIMIT, Request, Response, Traffic, Transport},
    public_url, sensitive_url,
};
use clap::ValueEnum;
use serde::{Deserialize, Serialize};
use std::{
    fmt,
    io::Write,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};
use url::Url;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize, ValueEnum)]
#[serde(rename_all = "kebab-case")]
pub enum ConnectorId {
    GithubReleases,
    Autopkg,
    Installomator,
    SparkleAppcasts,
    Electron,
    Tauri,
    UrlList,
}

impl ConnectorId {
    pub fn connector(self) -> &'static dyn Connector {
        match self {
            Self::GithubReleases => &github::Github,
            Self::Autopkg => &autopkg::AutoPkg,
            Self::Installomator => &installomator::Installomator,
            Self::SparkleAppcasts => &sparkle::Sparkle,
            Self::Electron => &electron::Electron,
            Self::Tauri => &tauri::Tauri,
            Self::UrlList => &url_list::UrlList,
        }
    }

    pub fn file(self) -> &'static str {
        match self {
            Self::GithubReleases => "github.rs",
            Self::Autopkg => "autopkg.rs",
            Self::Installomator => "installomator.rs",
            Self::SparkleAppcasts => "sparkle.rs",
            Self::Electron => "electron.rs",
            Self::Tauri => "tauri.rs",
            Self::UrlList => "url_list.rs",
        }
    }
}

impl fmt::Display for ConnectorId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{}",
            self.to_possible_value()
                .expect("each connector has a CLI name")
                .get_name()
        )
    }
}

pub struct Discovery {
    pub seed: Seed,
    pub candidates: Result<Vec<Candidate>, Failure>,
    pub traffic: Traffic,
}

/// Discovery is lazy over the input. An individual feed can yield multiple candidates.
/// Resolvers can return alternative direct artifacts while preserving the seed.
pub trait Connector: Sync {
    fn id(&self) -> ConnectorId;
    fn discover_one(
        &self,
        seed: &Seed,
        context: &mut Context<'_>,
    ) -> Result<Vec<Candidate>, Failure>;

    fn discover<'a>(
        &'a self,
        seeds: Box<dyn Iterator<Item = (Seed, Option<Failure>)> + 'a>,
        transport: &'a dyn Transport,
        cache: Option<&'a Path>,
    ) -> Box<dyn Iterator<Item = Discovery> + 'a> {
        Box::new(seeds.map(move |(seed, error)| {
            let mut context = Context::new(transport, cache);
            let candidates = match error {
                Some(error) => Err(error),
                None if seed.direct => self
                    .direct(&seed, &seed.url)
                    .map(|candidate| vec![candidate]),
                None => self.discover_one(&seed, &mut context),
            };
            Discovery {
                seed,
                candidates,
                traffic: context.traffic,
            }
        }))
    }

    fn resolve(
        &self,
        candidate: &Candidate,
        _: &mut Context<'_>,
    ) -> Result<Vec<Candidate>, Failure> {
        Ok(vec![candidate.clone()])
    }

    fn direct(&self, seed: &Seed, url: &str) -> Result<Candidate, Failure> {
        Candidate::new(&self.id().to_string(), seed, url)
    }

    fn parse_error(&self, message: impl Into<String>) -> Failure
    where
        Self: Sized,
    {
        Failure::new(format!("parse_error:{}", self.id()), message)
    }
}

pub struct Context<'a> {
    pub transport: &'a dyn Transport,
    pub traffic: Traffic,
    cache: Option<&'a Path>,
    deadline: Instant,
}

impl<'a> Context<'a> {
    pub fn new(transport: &'a dyn Transport, cache: Option<&'a Path>) -> Self {
        Self {
            transport,
            traffic: Traffic::default(),
            cache,
            deadline: Instant::now() + Duration::from_secs(45),
        }
    }

    pub fn metadata(&mut self, target: &str, github_api: bool) -> Result<Response, Failure> {
        self.metadata_bounded(target, github_api, METADATA_LIMIT)
    }

    pub fn metadata_bounded(
        &mut self,
        target: &str,
        github_api: bool,
        limit: usize,
    ) -> Result<Response, Failure> {
        let url = public_url(target)?;
        if sensitive_url(&url) {
            return Err(Failure::new(
                "needs_login",
                "credential-bearing URL requires a separate workflow",
            ));
        }
        let key = format!("{}\n{}\n{}", url, github_api, limit);
        let path = self
            .cache
            .map(|dir| dir.join(format!("{}.json", crate::digest(&key))));
        let cached = path.as_ref().and_then(|p| read_cache(p, limit).ok());
        let mut request = Request::new(url.clone(), BodyMode::Metadata(limit));
        request.if_none_match = cached.as_ref().map(|entry| entry.etag.clone());
        request.github_api = github_api;
        request.deadline = Some(self.deadline);
        let mut response = self.transport.fetch(request, &mut self.traffic)?;
        if response.status == 304 {
            let cached = cached
                .filter(|entry| entry.final_url == response.url.as_str())
                .ok_or_else(|| {
                    Failure::new(
                        "invalid_cache",
                        "304 without a matching cached representation",
                    )
                })?;
            response.status = 200;
            response.headers.insert("etag".into(), cached.etag);
            if let Some(kind) = cached.content_type {
                response.headers.insert("content-type".into(), kind);
            }
            response.body = cached.body.into_bytes();
            return Ok(response);
        }
        response.require_success(&url)?;
        let prefix = &response.body[..response.body.len().min(512)];
        let media_html = response
            .header("content-type")
            .is_some_and(|value| value.to_ascii_lowercase().starts_with("text/html"));
        if looks_like_html(prefix) || media_html && !looks_like_feed(prefix) {
            return Err(
                Failure::new("html_landing_page", "metadata endpoint served HTML")
                    .with_http(response.evidence(&url)),
            );
        }
        if github_api
            && serde_json::from_slice::<serde_json::Value>(&response.body)
                .ok()
                .and_then(|body| body.get("private").and_then(serde_json::Value::as_bool))
                .unwrap_or(false)
        {
            return Err(Failure::new(
                "needs_login",
                "private repositories require a separate workflow",
            ));
        }
        if let (Some(path), Some(etag), Ok(body)) = (
            path,
            response.header("etag"),
            std::str::from_utf8(&response.body),
        ) && response.url == url
            && !sensitive_url(&response.url)
        {
            let cache = Cached {
                etag: etag.into(),
                final_url: response.url.to_string(),
                content_type: response.header("content-type").map(str::to_owned),
                body: body.into(),
            };
            // Cache availability never changes discovery correctness.
            let _ = write_cache(path, &cache);
        }
        Ok(response)
    }
}

pub fn looks_like_html(prefix: &[u8]) -> bool {
    let text = String::from_utf8_lossy(prefix);
    let text = text
        .trim_start_matches('\u{feff}')
        .trim_start()
        .to_ascii_lowercase();
    text.starts_with("<html") || text.starts_with("<!doctype html") || text.starts_with("<head")
}

fn looks_like_feed(prefix: &[u8]) -> bool {
    let text = String::from_utf8_lossy(prefix);
    let text = text.trim_start_matches('\u{feff}').trim_start();
    ["<?xml", "<rss", "<plist", "{", "["]
        .iter()
        .any(|start| text.starts_with(start))
}

#[derive(Serialize, Deserialize)]
struct Cached {
    etag: String,
    final_url: String,
    content_type: Option<String>,
    body: String,
}

fn read_cache(path: &Path, limit: usize) -> AnyResult<Cached> {
    let file = std::fs::File::open(path)?;
    if file.metadata()?.len() > (limit as u64 * 6 + 4096) {
        return Err("oversize cache entry".into());
    }
    let cache: Cached = serde_json::from_reader(std::io::BufReader::new(file))?;
    if cache.body.len() > limit {
        return Err("oversize cache body".into());
    }
    Ok(cache)
}

fn write_cache(path: PathBuf, body: &Cached) -> AnyResult<()> {
    atomic(&path, |file| {
        serde_json::to_writer(&mut *file, body)?;
        file.write_all(b"\n")?;
        Ok(())
    })
}

fn candidate_from(
    connector: &dyn Connector,
    seed: &Seed,
    observed: Seed,
    url: &str,
) -> Result<Candidate, Failure> {
    let mut candidate = connector.direct(&observed, url)?;
    candidate.seed = seed.clone();
    candidate.seed.url = crate::recorded_url(&seed.url);
    Ok(candidate)
}

fn join_public(base: &Url, value: &str) -> Result<Url, Failure> {
    let url = base
        .join(value)
        .map_err(|_| Failure::new("invalid_url", "invalid artifact link"))?;
    let url = public_url(url.as_str())?;
    if sensitive_url(&url) {
        return Err(Failure::new(
            "needs_login",
            "feed exposed an expiring or credential-bearing artifact URL",
        ));
    }
    Ok(url)
}

fn asset_priority(name: &str) -> u8 {
    let lower = name.to_ascii_lowercase();
    if lower.contains("universal") {
        0
    } else if lower.contains("arm64") || lower.contains("aarch64") || lower.contains("silicon") {
        1
    } else if lower.contains("intel") || lower.contains("x86_64") || lower.contains("x64") {
        3
    } else {
        2
    }
}

pub fn parse_seed(line: &str) -> Result<Seed, Failure> {
    if line.starts_with('{') {
        serde_json::from_str(line).map_err(|error| {
            Failure::new(
                "parse_error:input",
                format!("invalid seed JSON at column {}", error.column()),
            )
        })
    } else {
        Ok(Seed {
            url: line.into(),
            ..Seed::default()
        })
    }
}

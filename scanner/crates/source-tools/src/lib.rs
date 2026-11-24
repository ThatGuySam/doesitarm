//! Discovery, bounded architecture scanning, and replayable source triage.

pub mod artifact;
pub mod connectors;
pub mod http;
pub mod pipeline;
pub mod triage;

use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fmt, path::Path};
use url::Url;

pub type AnyResult<T> = Result<T, Box<dyn std::error::Error + Send + Sync>>;

pub fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

pub fn digest(value: &str) -> String {
    encode_hex(&Sha256::digest(value.as_bytes()))
}

pub(crate) fn encode_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct Seed {
    pub url: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub vendor: String,
    #[serde(default, alias = "bundle_id_if_known")]
    pub bundle_id: Option<String>,
    #[serde(default, alias = "version_if_known")]
    pub version: Option<String>,
    #[serde(default)]
    pub format_guess: Option<String>,
    #[serde(default)]
    pub size: Option<u64>,
    #[serde(default)]
    pub etag: Option<String>,
    #[serde(default)]
    pub minimum_system_version: Option<String>,
    #[serde(default)]
    pub direct: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Candidate {
    pub source: String,
    pub name: String,
    pub url: String,
    #[serde(default)]
    pub download_url: Option<String>,
    pub format_guess: Option<String>,
    pub bundle_id: Option<String>,
    pub version: Option<String>,
    pub size: Option<u64>,
    pub etag: Option<String>,
    pub discovered_at: String,
    pub vendor: Option<String>,
    pub minimum_system_version: Option<String>,
    pub seed: Seed,
}

impl Candidate {
    pub fn new(source: &str, seed: &Seed, url: &str) -> Result<Self, Failure> {
        let url = public_url(url)?;
        let mut recorded_seed = seed.clone();
        recorded_seed.url = recorded_url(&seed.url);
        Ok(Self {
            source: source.into(),
            name: if seed.name.is_empty() {
                file_name(&url).into()
            } else {
                seed.name.clone()
            },
            download_url: None,
            format_guess: format_guess(file_name(&url))
                .map(str::to_owned)
                .or_else(|| seed.format_guess.clone()),
            bundle_id: seed.bundle_id.clone(),
            version: seed.version.clone(),
            size: seed.size,
            etag: seed.etag.clone(),
            discovered_at: now(),
            vendor: (!seed.vendor.is_empty())
                .then(|| seed.vendor.to_lowercase())
                .or_else(|| vendor(&url)),
            minimum_system_version: seed.minimum_system_version.clone(),
            url: url.into(),
            seed: recorded_seed,
        })
    }

    pub fn id(&self) -> String {
        digest(&format!("{}\n{}", self.source, normalized_url(&self.url)))
    }
}

pub fn file_name(url: &Url) -> &str {
    url.path()
        .rsplit('/')
        .find(|part| !part.is_empty())
        .unwrap_or_default()
}

pub fn vendor(url: &Url) -> Option<String> {
    let host = url.host_str()?;
    if host == "github.com" {
        return url
            .path_segments()?
            .next()
            .filter(|p| !p.is_empty())
            .map(str::to_lowercase);
    }
    Some(host.to_lowercase())
}

pub fn format_guess(name: &str) -> Option<&'static str> {
    let name = name.to_ascii_lowercase();
    [
        (".tar.gz", "tar.gz"),
        (".tgz", "tar.gz"),
        (".tar.bz2", "tar.bz2"),
        (".tbz2", "tar.bz2"),
        (".tar.xz", "tar.xz"),
        (".tar.zst", "tar.zst"),
        (".tar", "tar"),
        (".zip", "zip"),
        (".dmg", "dmg"),
        (".pkg", "pkg"),
        (".mpkg", "pkg"),
        (".rar", "rar"),
        (".7z", "7z"),
        (".nar", "nar"),
    ]
    .into_iter()
    .find_map(|(extension, kind)| name.ends_with(extension).then_some(kind))
}

pub fn public_url(value: &str) -> Result<Url, Failure> {
    let mut url = Url::parse(value).map_err(|_| Failure::new("invalid_url", "invalid URL"))?;
    let host = url.host_str().unwrap_or_default().trim_end_matches('.');
    if !matches!(url.scheme(), "https" | "http")
        || !url.username().is_empty()
        || url.password().is_some()
        || !host.contains('.')
        || host.ends_with(".localhost")
        || host.ends_with(".local")
        || matches!(url.host(), Some(url::Host::Ipv4(_) | url::Host::Ipv6(_)))
        || url.port().is_some()
    {
        return Err(Failure::new(
            "invalid_url",
            "expected a public HTTP(S) hostname without credentials or a custom port",
        ));
    }
    url.set_fragment(None);
    Ok(url)
}

fn sensitive_query_key(key: &str) -> bool {
    let key = key.to_ascii_lowercase();
    key.starts_with("x-amz-")
        || key.starts_with("x-goog-")
        || [
            "token",
            "signature",
            "credential",
            "password",
            "auth",
            "secret",
            "session",
            "license",
            "api_key",
        ]
        .iter()
        .any(|part| key.contains(part))
        || matches!(
            key.as_str(),
            "sig" | "jwt" | "key" | "sp" | "se" | "sv" | "skt" | "skoid"
        )
}

pub fn sensitive_url(url: &Url) -> bool {
    !url.username().is_empty()
        || url.password().is_some()
        || url.query_pairs().any(|(key, _)| sensitive_query_key(&key))
}

pub fn recorded_url(value: &str) -> String {
    let Ok(mut url) = Url::parse(value) else {
        return if value.contains("://") {
            "[invalid URL]".into()
        } else {
            value.into()
        };
    };
    if sensitive_url(&url) {
        let _ = url.set_username("");
        let _ = url.set_password(None);
        url.set_query(None);
    }
    url.set_fragment(None);
    url.into()
}

pub fn normalized_url(value: &str) -> String {
    let Ok(mut url) = Url::parse(value) else {
        return value.into();
    };
    url.set_fragment(None);
    let pairs: Vec<_> = url
        .query_pairs()
        .filter(|(key, _)| {
            !key.to_ascii_lowercase().starts_with("utm_")
                && !matches!(key.as_ref(), "fbclid" | "gclid")
        })
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();
    if url.query().is_some() {
        url.set_query(None);
        if !pairs.is_empty() {
            url.query_pairs_mut().extend_pairs(pairs);
        }
    }
    url.into()
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct HttpEvidence {
    pub url: String,
    pub final_url: String,
    pub status: Option<u16>,
    pub headers: std::collections::BTreeMap<String, String>,
    pub first_bytes_hex: String,
    pub first_bytes_text: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Failure {
    pub class: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub http: Option<Box<HttpEvidence>>,
}

impl Failure {
    pub fn new(class: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            class: class.into(),
            message: message.into(),
            http: None,
        }
    }

    pub fn with_http(mut self, http: HttpEvidence) -> Self {
        self.http = Some(Box::new(http));
        self
    }
}

impl fmt::Display for Failure {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.class, self.message)
    }
}
impl std::error::Error for Failure {}

pub fn atomic(
    path: &Path,
    write: impl FnOnce(&mut std::fs::File) -> AnyResult<()>,
) -> AnyResult<()> {
    let directory = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    std::fs::create_dir_all(directory)?;
    let mut temp = tempfile::NamedTempFile::new_in(directory)?;
    write(temp.as_file_mut())?;
    temp.as_file().sync_all()?;
    temp.persist(path)?;
    Ok(())
}

#![forbid(unsafe_code)]

mod adapters;
mod html;
mod ranking;

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use url::{Host, Url};

pub const MAX_DOCUMENT_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_METADATA_BYTES: usize = 512 * 1024;
const MAX_CANDIDATES: usize = 16;
const MAX_HOSTS: usize = 8;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    DirectFile,
    Redirect,
    Feed,
    ReleaseApi,
    AppStore,
    InstallerStub,
    Gated,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Arch {
    Arm64,
    X86_64,
    Universal,
    Unknown,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Os {
    Macos,
    Other,
    Unknown,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Decision {
    Resolved,
    Ambiguous,
    NeedsApi,
    Gated,
    None,
}

#[derive(Clone, Debug, Serialize)]
pub struct Evidence {
    pub source: &'static str,
    pub selector: String,
    pub text: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct Candidate {
    pub url: Url,
    pub score: i32,
    pub reasons: Vec<&'static str>,
    pub arch: Arch,
    pub os: Os,
    pub kind: Kind,
    pub evidence: Evidence,
}

impl Candidate {
    pub fn is_artifact(&self) -> bool {
        matches!(
            self.kind,
            Kind::DirectFile | Kind::InstallerStub | Kind::Redirect
        )
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct Resolution {
    pub decision: Decision,
    pub reason: &'static str,
    pub candidates: Vec<Candidate>,
    pub page_features: PageFeatures,
}

#[derive(Clone, Debug, Default, Serialize)]
pub struct PageFeatures {
    pub tokens: usize,
    pub link_hints: usize,
    pub script_blocks: usize,
    pub candidate_hosts: usize,
    pub limit_hit: bool,
}

#[derive(Clone, Copy, Default)]
pub struct Headers<'a> {
    pub status: Option<u16>,
    pub content_type: Option<&'a str>,
    pub link: Option<&'a str>,
}

#[derive(Clone, Copy)]
pub struct Document<'a> {
    pub url: &'a Url,
    pub bytes: &'a [u8],
    pub headers: Headers<'a>,
}

pub fn public_url(raw: &str, base: Option<&Url>) -> Option<Url> {
    let raw = raw.trim();
    if raw.is_empty() || raw.len() > 4096 || raw.contains(['\\', '\r', '\n', '\t', '\0']) {
        return None;
    }
    // An empty userinfo component disappears when WHATWG URL parsers serialize it.
    let authority = raw
        .strip_prefix("//")
        .or_else(|| raw.split_once("://").map(|(_, tail)| tail));
    if authority.is_some_and(|tail| {
        tail.split(['/', '?', '#'])
            .next()
            .is_some_and(|a| a.contains('@'))
    }) {
        return None;
    }
    let mut url = match base {
        Some(base) => base.join(raw),
        None => Url::parse(raw),
    }
    .ok()?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
    {
        return None;
    }
    let Host::Domain(host) = url.host()? else {
        return None;
    };
    let host = host.trim_end_matches('.');
    let tld = host.rsplit_once('.')?.1;
    if matches!(
        tld,
        "localhost"
            | "local"
            | "internal"
            | "lan"
            | "test"
            | "invalid"
            | "example"
            | "onion"
            | "alt"
            | "arpa"
    ) || !host.split('.').all(|label| {
        !label.is_empty()
            && label.len() <= 63
            && !label.starts_with('-')
            && !label.ends_with('-')
            && label
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-')
    }) {
        return None;
    }
    let canonical = host.to_owned();
    url.set_host(Some(&canonical)).ok()?;
    url.set_fragment(None);
    (url.as_str().len() <= 4096).then_some(url)
}

struct Hint {
    raw: String,
    evidence: Evidence,
    kind: Option<Kind>,
    mac_context: bool,
}

struct Context<'a> {
    base: &'a Url,
    candidates: BTreeMap<Url, Candidate>,
    features: PageFeatures,
    gate: Option<&'static str>,
}

impl Context<'_> {
    fn add(
        &mut self,
        raw: &str,
        source: &'static str,
        selector: &str,
        text: &str,
        kind: Option<Kind>,
        mac_context: bool,
    ) {
        self.hint(Hint {
            raw: raw.to_owned(),
            evidence: Evidence {
                source,
                selector: short(selector, 200),
                text: short(text, 160),
            },
            kind,
            mac_context,
        });
    }

    fn hint(&mut self, hint: Hint) {
        self.features.link_hints += 1;
        if self.candidates.len() >= 2048 {
            self.features.limit_hit = true;
            return;
        }
        let Some(url) = public_url(&hint.raw, Some(self.base)) else {
            return;
        };
        if &url == self.base {
            return;
        }
        let (url, hint) = adapters::distribution::rewrite(url, hint);
        if let Some(candidate) = ranking::rank(url, hint) {
            let slot = self
                .candidates
                .entry(candidate.url.clone())
                .or_insert_with(|| candidate.clone());
            if candidate.score > slot.score {
                *slot = candidate;
            }
        }
    }

    fn finish(mut self) -> Resolution {
        let hosts: BTreeSet<_> = self
            .candidates
            .values()
            .filter(|c| c.is_artifact() && c.score >= ranking::FOLLOW)
            .filter_map(|c| c.url.host_str())
            .collect();
        self.features.candidate_hosts = hosts.len();
        let mut candidates: Vec<_> = self.candidates.into_values().collect();
        candidates.sort_by(|a, b| b.score.cmp(&a.score).then_with(|| a.url.cmp(&b.url)));
        let eligible: Vec<_> = candidates
            .iter()
            .filter(|c| c.is_artifact() && c.score >= ranking::ELIGIBLE)
            .take(2)
            .collect();
        let fallback = candidates.iter().any(|c| {
            matches!(c.kind, Kind::Feed | Kind::ReleaseApi)
                || (c.kind == Kind::Redirect && c.score >= ranking::FOLLOW)
        });
        let store_only = candidates.iter().any(|c| c.kind == Kind::AppStore);
        let hosted_gate = candidates.iter().any(|c| c.kind == Kind::Gated);
        let (decision, reason) = if let Some(reason) = self.gate {
            candidates.retain(|c| matches!(c.kind, Kind::AppStore | Kind::Gated));
            (Decision::Gated, reason)
        } else if self.features.limit_hit {
            candidates.clear();
            (Decision::None, "document_limit")
        } else if self.features.candidate_hosts > MAX_HOSTS {
            candidates.clear();
            (Decision::None, "too_many_hosts")
        } else if let Some(best) = eligible.first() {
            if eligible
                .get(1)
                .is_some_and(|second| ranking::unclear(best, second))
            {
                (Decision::Ambiguous, "multiple_downloads")
            } else {
                (Decision::Resolved, "ranked_download")
            }
        } else if fallback {
            (Decision::NeedsApi, "follow_up_available")
        } else if store_only {
            (Decision::Gated, "app_store")
        } else if hosted_gate {
            (Decision::Gated, "vendor_action")
        } else {
            (Decision::None, "no_public_download")
        };
        candidates.truncate(MAX_CANDIDATES);
        Resolution {
            decision,
            reason,
            candidates,
            page_features: self.features,
        }
    }
}

pub fn resolve(document: Document<'_>, metadata: Option<Document<'_>>) -> Resolution {
    resolve_with_adapters(document, metadata, true)
}

pub fn resolve_with_adapters(
    document: Document<'_>,
    metadata: Option<Document<'_>>,
    adapters_enabled: bool,
) -> Resolution {
    let mut context = Context {
        base: document.url,
        candidates: BTreeMap::new(),
        features: PageFeatures::default(),
        gate: adapters::distribution::gate(document.url, document.headers.status),
    };
    if context.gate.is_some() {
        return context.finish();
    }
    if document.bytes.len() > MAX_DOCUMENT_BYTES {
        context.features.limit_hit = true;
        return context.finish();
    }

    let media_type = document
        .headers
        .content_type
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("")
        .trim();
    let bytes = document.bytes;
    if media_type == "application/json" || media_type.ends_with("+json") {
        if adapters_enabled {
            adapters::metadata(&mut context, bytes, media_type, None);
        }
    } else if matches!(
        media_type,
        "application/xml"
            | "text/xml"
            | "application/rss+xml"
            | "application/atom+xml"
            | "text/plain"
    ) {
        if adapters_enabled {
            adapters::metadata(&mut context, bytes, media_type, None);
        }
    } else if media_type.is_empty() || matches!(media_type, "text/html" | "application/xhtml+xml") {
        html::parse(&mut context, bytes, adapters_enabled);
        if adapters_enabled && context.gate.is_none() && !context.features.limit_hit {
            adapters::discover(&mut context);
        }
    }
    if adapters_enabled && context.gate.is_none() && !context.features.limit_hit {
        if let Some(header) = document.headers.link.filter(|link| link.len() <= 8192) {
            adapters::header_links(&mut context, header);
        }
        if let Some(metadata) = metadata.filter(|meta| meta.bytes.len() <= MAX_METADATA_BYTES) {
            // A supplemental response is meaningful only for a declared/derived endpoint.
            if let Some(endpoint) = context
                .candidates
                .get(metadata.url)
                .filter(|c| matches!(c.kind, Kind::Feed | Kind::ReleaseApi))
            {
                let context_url = context.base;
                let mac = endpoint.os == Os::Macos;
                context.base = metadata.url;
                adapters::metadata(
                    &mut context,
                    metadata.bytes,
                    metadata.headers.content_type.unwrap_or("application/json"),
                    Some(mac),
                );
                context.base = context_url;
            }
        }
    }
    context.finish()
}

pub fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn short(text: &str, max: usize) -> String {
    text.chars()
        .filter(|c| {
            !c.is_control() && !matches!(c, '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}')
        })
        .take(max)
        .collect()
}

/// The same top-level fields as scanner-ledger's Record. URLs are reduced to
/// origin/path for local kits or replaced entirely by hashes for service logs.
pub fn unresolved_record(
    document: Document<'_>,
    resolution: &Resolution,
    hashes_only: bool,
) -> serde_json::Value {
    let safe_url = |url: &Url| {
        if hashes_only {
            return format!("sha256:{}", sha256(url.as_str().as_bytes()));
        }
        let mut safe = url.clone();
        safe.set_query(None);
        safe.set_fragment(None);
        // File-share keys can also occur in paths.
        if adapters::distribution::share_host(url) {
            safe.set_path("/");
        }
        safe.to_string()
    };
    let original = safe_url(document.url);
    let html_hash = sha256(document.bytes);
    let ledger_id = sha256(format!("download_page:{original}:{html_hash}").as_bytes());
    let candidates: Vec<_> = resolution.candidates.iter().filter(|c| c.is_artifact()).take(5).map(|c| {
        serde_json::json!({ "url": safe_url(&c.url), "score": c.score, "reasons": c.reasons, "kind": c.kind })
    }).collect();
    serde_json::json!({
        "schema_version": 1, "ledger_id": ledger_id, "source": "download_page",
        "original_url": original, "url_redacted": true, "redacted": true,
        "http_status": document.headers.status, "time_bucket": html_hash,
        "status": "unresolved_page", "failure_class": "unresolved_page", "error": resolution.reason,
        "settings": { "profile": "page_resolver" }, "provenance": [],
        "evidence": {
            "html_sha256": html_hash, "decision": resolution.decision,
            "tried_rules": ["html_controls", "structured_data", "literal_urls", "provider_routes"],
            "top_rejected_candidates": candidates, "page_features": resolution.page_features
        }
    })
}

/// Return the public download action for providers with a documented share mode.
pub fn direct_target(url: &Url) -> Option<String> {
    adapters::direct_target(url)
}

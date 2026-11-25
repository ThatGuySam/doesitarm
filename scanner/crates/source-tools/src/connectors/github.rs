use super::{Connector, ConnectorId, Context, asset_priority, candidate_from, join_public};
use crate::{Candidate, Failure, Seed, file_name, format_guess, public_url};
use percent_encoding::percent_decode_str;
use serde::Deserialize;
use url::Url;

pub struct Github;

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    draft: bool,
    prerelease: bool,
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
struct Asset {
    id: Option<u64>,
    name: String,
    browser_download_url: String,
    size: u64,
    state: String,
}

impl Connector for Github {
    fn id(&self) -> ConnectorId {
        ConnectorId::GithubReleases
    }

    fn discover_one(
        &self,
        seed: &Seed,
        context: &mut Context<'_>,
    ) -> Result<Vec<Candidate>, Failure> {
        let value = if seed.url.contains("://") {
            seed.url.clone()
        } else {
            format!("https://github.com/{}", seed.url)
        };
        let url = public_url(&value)?;
        if url.host_str() != Some("github.com") || url.scheme() != "https" || url.query().is_some()
        {
            return Err(self.parse_error("expected a github.com owner/repo or release URL"));
        }
        let parts: Vec<_> = url.path().trim_matches('/').split('/').collect();
        if matches!(parts.as_slice(), [_, _, "releases", "download", ..]) {
            if eligible(file_name(&url)) {
                return Ok(vec![self.direct(seed, url.as_str())?]);
            }
            return Err(
                self.parse_error("asset filename does not identify a compiled macOS release")
            );
        }
        let (owner, repo, tag) = match parts.as_slice() {
            [owner, repo] | [owner, repo, "releases"] | [owner, repo, "releases", "latest"] => {
                (*owner, *repo, None)
            }
            [owner, repo, "releases", "tag", tag @ ..] if !tag.is_empty() => {
                (*owner, *repo, Some(tag.join("%2F")))
            }
            _ => {
                return Err(self
                    .parse_error("expected a repository, latest release, or pinned release tag"));
            }
        };
        let repo = repo.trim_end_matches(".git");
        let api = public_repo_api(context, owner, repo)?;
        let endpoint = format!(
            "{api}/releases/{}",
            tag.map_or_else(|| "latest".into(), |tag| format!("tags/{tag}"))
        );
        let response = context.metadata(&endpoint, true)?;
        self.parse(seed, owner, repo, &response.body)
            .map_err(|error| error.with_http(response.evidence(&public_url(&endpoint).unwrap())))
    }
}

fn public_repo_api(context: &mut Context<'_>, owner: &str, repo: &str) -> Result<String, Failure> {
    if ![owner, repo].iter().all(|value| {
        !matches!(*value, "" | "." | "..")
            && value
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"-._".contains(&b))
    }) {
        return Err(Github.parse_error("invalid repository owner or name"));
    }
    // A token must not turn public discovery into private repository access.
    let api = format!("https://api.github.com/repos/{owner}/{repo}");
    if context.transport.github_authenticated() {
        let visibility = context.metadata_bounded(&api, true, 256 * 1024)?;
        let repo_info: Repo = serde_json::from_slice(&visibility.body).map_err(|_| {
            Github
                .parse_error("invalid GitHub repository JSON")
                .with_http(visibility.evidence(&public_url(&api).unwrap()))
        })?;
        if repo_info.private {
            return Err(Failure::new(
                "needs_login",
                "private repositories require a separate workflow",
            ));
        }
    }
    Ok(api)
}

pub(super) fn pinned_release_parts(url: &Url) -> Option<(&str, &str, &str, &str)> {
    if url.scheme() != "https" || url.host_str() != Some("github.com") || url.query().is_some() {
        return None;
    }
    let mut path = url.path().trim_start_matches('/').splitn(5, '/');
    let owner = path.next()?;
    let repo = path.next()?;
    if path.next()? != "releases" || path.next()? != "download" {
        return None;
    }
    let (tag, name) = path.next()?.rsplit_once('/')?;
    (!tag.is_empty() && !name.is_empty()).then_some((owner, repo, tag, name))
}

pub(super) fn pinned_asset(url: &Url, context: &mut Context<'_>) -> Result<Option<Url>, Failure> {
    let Some((owner, repo, tag, name)) = pinned_release_parts(url) else {
        return Ok(None);
    };
    let decode = |part: &str| {
        percent_decode_str(part)
            .decode_utf8()
            .map(|value| value.into_owned())
            .map_err(|_| Github.parse_error("release path is not UTF-8"))
    };
    let tag = decode(tag)?;
    let name = decode(name)?;
    let api = public_repo_api(context, owner, repo)?;
    let mut endpoint = public_url(&format!("{api}/releases/tags"))?;
    endpoint.path_segments_mut().unwrap().push(&tag);
    let response = context.metadata(endpoint.as_str(), true)?;
    let failure =
        |class, message| Failure::new(class, message).with_http(response.evidence(&endpoint));
    let release: Release = serde_json::from_slice(&response.body)
        .map_err(|_| failure("parse_error:github-releases", "invalid GitHub release JSON"))?;
    if release.draft || release.tag_name != tag {
        return Err(failure(
            "release_mismatch",
            "API did not return the pinned published release",
        ));
    }
    let id = release
        .assets
        .into_iter()
        .find(|asset| asset.state == "uploaded" && asset.name == name)
        .and_then(|asset| asset.id)
        .ok_or_else(|| {
            failure(
                "release_asset_not_found",
                "pinned file has no uploaded asset ID",
            )
        })?;
    public_url(&format!("{api}/releases/assets/{id}")).map(Some)
}

#[derive(Deserialize)]
struct Repo {
    private: bool,
}

impl Github {
    fn parse(
        &self,
        seed: &Seed,
        owner: &str,
        repo: &str,
        body: &[u8],
    ) -> Result<Vec<Candidate>, Failure> {
        let mut release: Release = serde_json::from_slice(body)
            .map_err(|_| self.parse_error("invalid GitHub release JSON"))?;
        if release.draft || release.prerelease {
            return Err(self.parse_error("release is a draft or prerelease"));
        }
        release
            .assets
            .sort_by_key(|asset| asset_priority(&asset.name));
        let base = public_url("https://github.com/").expect("valid base");
        let prefix = format!("/{owner}/{repo}/releases/download/").to_ascii_lowercase();
        let mut results = Vec::new();
        for asset in release.assets {
            if asset.state != "uploaded" || !eligible(&asset.name) {
                continue;
            }
            let url = join_public(&base, &asset.browser_download_url)?;
            if url.host_str() != Some("github.com")
                || url.scheme() != "https"
                || !url.path().to_ascii_lowercase().starts_with(&prefix)
            {
                continue;
            }
            let observed = Seed {
                name: if seed.name.is_empty() {
                    repo.into()
                } else {
                    seed.name.clone()
                },
                vendor: if seed.vendor.is_empty() {
                    owner.into()
                } else {
                    seed.vendor.clone()
                },
                size: Some(asset.size),
                version: Some(release.tag_name.clone()),
                ..seed.clone()
            };
            let mut candidate = candidate_from(self, seed, observed, url.as_str())?;
            if let Some(id) = asset.id {
                candidate.download_url = Some(format!(
                    "https://api.github.com/repos/{owner}/{repo}/releases/assets/{id}"
                ));
            }
            results.push(candidate);
        }
        if results.is_empty() {
            return Err(Failure::new(
                "no_mac_assets",
                "release has no eligible uploaded macOS asset",
            ));
        }
        Ok(results)
    }
}

fn eligible(name: &str) -> bool {
    let name = name.to_ascii_lowercase();
    let Some(kind) = format_guess(&name) else {
        return false;
    };
    if [
        "debugsymbol",
        "debug-symbol",
        "dsym",
        "symbols",
        "source-code",
        "sources.",
        "blockmap",
        ".delta",
    ]
    .iter()
    .any(|part| name.contains(part))
    {
        return false;
    }
    matches!(kind, "dmg" | "pkg")
        || name
            .split(|c: char| !c.is_ascii_alphanumeric())
            .any(|word| matches!(word, "darwin" | "macos" | "mac" | "osx" | "macosx"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::{Request, Response, Traffic, Transport};
    use std::sync::Mutex;

    const RELEASE: &str = include_str!("../../tests/fixtures/github-release.json");

    struct GitHubFixture {
        requests: Mutex<Vec<(String, Option<String>)>>,
    }

    impl Transport for GitHubFixture {
        fn github_authenticated(&self) -> bool {
            true
        }

        fn fetch(&self, request: Request, _: &mut Traffic) -> Result<Response, Failure> {
            if request.url.path().ends_with("/assets/43") {
                assert!(!request.github_api);
                return Ok(Response {
                    url: request.url,
                    status: 200,
                    body: include_str!("../../tests/fixtures/sparkle-appcast.xml")
                        .replace("files/Viewer.zip", "Viewer-darwin-x64.zip")
                        .into_bytes(),
                    headers: Default::default(),
                    received: 0,
                    too_large: false,
                    read_failure: None,
                });
            }
            if !request.github_api {
                return Err(Failure::new("robots_disallowed", "release page disallowed"));
            }
            let etag = request.if_none_match;
            self.requests
                .lock()
                .unwrap()
                .push((request.url.to_string(), etag.clone()));
            let body = if request.url.path().contains("/releases/") {
                RELEASE
            } else {
                r#"{"private":false}"#
            };
            Ok(Response {
                url: request.url,
                status: if etag.is_some() { 304 } else { 200 },
                body: if etag.is_some() {
                    vec![]
                } else {
                    body.as_bytes().to_vec()
                },
                headers: [("etag".into(), "\"fixture\"".into())].into(),
                received: 0,
                too_large: false,
                read_failure: None,
            })
        }
    }

    #[test]
    fn selects_published_mac_assets_and_reuses_etag_cache() {
        let input = Seed {
            url: "example/Viewer".into(),
            ..Seed::default()
        };
        let cache = tempfile::tempdir().unwrap();
        let fixture = GitHubFixture {
            requests: Mutex::default(),
        };
        for _ in 0..2 {
            let mut ctx = Context::new(&fixture, Some(cache.path()));
            let result = Github.discover_one(&input, &mut ctx).unwrap();
            assert_eq!(result.len(), 2);
            assert!(result[0].url.ends_with("Viewer-universal.dmg"));
            assert_eq!(result[0].version.as_deref(), Some("v2.1"));
            assert_eq!(result[0].size, Some(12345));
            assert_eq!(
                result[0].download_url.as_deref(),
                Some("https://api.github.com/repos/example/Viewer/releases/assets/42")
            );
            assert!(result[1].url.ends_with("Viewer-darwin-x64.zip"));
        }
        let calls = fixture.requests.into_inner().unwrap();
        assert_eq!(calls.len(), 4);
        assert_eq!(calls[0].1, None);
        assert_eq!(calls[3].1.as_deref(), Some("\"fixture\""));
    }

    #[test]
    fn resolves_a_pinned_release_file_without_fetching_the_github_page() {
        let seed = Seed {
            url: "https://github.com/example/Viewer/releases/download/v2.1/Viewer-darwin-x64.zip"
                .into(),
            direct: true,
            ..Seed::default()
        };
        let candidate = Github.direct(&seed, &seed.url).unwrap();
        let fixture = GitHubFixture {
            requests: Mutex::default(),
        };
        let candidates = Github
            .resolve(&candidate, &mut Context::new(&fixture, None))
            .unwrap();
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].url, seed.url);
        assert_eq!(
            candidates[0].download_url.as_deref(),
            Some("https://api.github.com/repos/example/Viewer/releases/assets/41")
        );
        assert_eq!(
            fixture.requests.into_inner().unwrap(),
            [
                ("https://api.github.com/repos/example/Viewer".into(), None),
                (
                    "https://api.github.com/repos/example/Viewer/releases/tags/v2.1".into(),
                    None
                )
            ]
        );
    }

    #[test]
    fn fetches_an_appcast_release_asset_via_the_api() {
        let seed = Seed {
            url: "https://github.com/example/Viewer/releases/download/v2.1/appcast.xml".into(),
            ..Seed::default()
        };
        let fixture = GitHubFixture {
            requests: Mutex::default(),
        };
        let candidates = ConnectorId::SparkleAppcasts
            .connector()
            .discover_one(&seed, &mut Context::new(&fixture, None))
            .unwrap();
        let [candidate] = candidates.as_slice() else {
            panic!("expected one stable macOS enclosure");
        };
        assert_eq!(
            candidate.url,
            "https://github.com/example/Viewer/releases/download/v2.1/Viewer-darwin-x64.zip"
        );
    }

    #[test]
    fn preserves_public_identity_and_the_recorded_binary_endpoint() {
        let seed = Seed {
            url: "https://github.com/AllenReder/not-boring-notch/releases/tag/v1.5.0".into(),
            ..Seed::default()
        };
        let recorded = include_bytes!("../../tests/fixtures/github-not-boring-notch.json");
        let candidates = Github
            .parse(&seed, "AllenReder", "not-boring-notch", recorded)
            .unwrap();
        let [candidate] = candidates.as_slice() else {
            panic!("expected one eligible release asset")
        };
        assert!(candidate.url.ends_with("/Not-Boring-Notch-v1.5.0.dmg"));
        assert_eq!(
            candidate.download_url.as_deref(),
            Some(
                "https://api.github.com/repos/AllenReder/not-boring-notch/releases/assets/770796900"
            )
        );
        assert_eq!(candidate.size, Some(14_846_117));
    }
}

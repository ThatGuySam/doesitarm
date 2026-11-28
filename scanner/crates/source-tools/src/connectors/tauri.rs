use super::{Connector, ConnectorId, Context, candidate_from, join_public, metadata_base};
use crate::{Candidate, Failure, Seed, file_name, http::is_github_asset, public_url};
use serde::Deserialize;
use std::collections::BTreeMap;
use url::Url;

pub struct Tauri;

#[derive(Deserialize)]
struct Manifest {
    version: String,
    #[serde(default)]
    platforms: BTreeMap<String, Asset>,
    url: Option<String>,
}

#[derive(Deserialize)]
struct Asset {
    url: String,
    size: Option<u64>,
}

impl Connector for Tauri {
    fn id(&self) -> ConnectorId {
        ConnectorId::Tauri
    }

    fn discover_one(
        &self,
        seed: &Seed,
        context: &mut Context<'_>,
    ) -> Result<Vec<Candidate>, Failure> {
        let target = public_url(&seed.url)?;
        let response = context.metadata(target.as_str(), false)?;
        self.parse(seed, metadata_base(&target, &response), &response.body)
            .map_err(|error| error.with_http(response.evidence(&target)))
    }

    fn resolve(
        &self,
        candidate: &Candidate,
        ctx: &mut Context<'_>,
    ) -> Result<Vec<Candidate>, Failure> {
        let url = public_url(&candidate.url)?;
        if !is_github_asset(&url) {
            return ctx.resolve_asset(candidate);
        }
        // Public asset descriptors may point to the JSON endpoint instead of the download.
        // Resolve anonymously so an updater can never use the operator's GitHub credentials.
        let response = ctx.metadata(&candidate.url, false)?;
        #[derive(Deserialize)]
        struct GithubAsset {
            browser_download_url: String,
        }
        let asset: GithubAsset = serde_json::from_slice(&response.body).map_err(|_| {
            self.parse_error("GitHub asset endpoint omitted browser_download_url")
                .with_http(response.evidence(&url))
        })?;
        let download = join_public(&url, &asset.browser_download_url)?;
        if download.host_str() != Some("github.com")
            || !download.path().contains("/releases/download/")
        {
            return Err(self
                .parse_error("asset descriptor did not return a public GitHub release download"));
        }
        let mut direct = candidate.clone();
        direct.download_url = Some(url.into());
        direct.url = download.into();
        direct.format_guess =
            crate::format_guess(file_name(&public_url(&direct.url)?)).map(str::to_owned);
        Ok(vec![direct])
    }
}

impl Tauri {
    fn parse(&self, seed: &Seed, base: &Url, bytes: &[u8]) -> Result<Vec<Candidate>, Failure> {
        let manifest: Manifest = serde_json::from_slice(bytes)
            .map_err(|_| self.parse_error("invalid Tauri update JSON"))?;
        let mut files: Vec<_> = manifest
            .platforms
            .into_iter()
            .filter(|(platform, _)| platform == "darwin" || platform.starts_with("darwin-"))
            .collect();
        files.sort_by_key(|(platform, _)| super::asset_priority(platform));
        if files.is_empty()
            && let Some(url) = manifest.url
        {
            // This single-object endpoint is selected by the caller for a Darwin platform.
            files.push(("darwin".into(), Asset { url, size: None }));
        }
        let mut results = Vec::new();
        for (_, file) in files {
            let url = join_public(base, &file.url)?;
            let observed = Seed {
                size: file.size,
                version: Some(manifest.version.clone()),
                ..seed.clone()
            };
            results.push(candidate_from(self, seed, observed, url.as_str())?);
        }
        if results.is_empty() {
            return Err(Failure::new(
                "no_mac_assets",
                "updater has no Darwin platform",
            ));
        }
        Ok(results)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::{Request, Response, Traffic, Transport};

    struct AssetFixture;
    impl Transport for AssetFixture {
        fn fetch(&self, request: Request, _: &mut Traffic) -> Result<Response, Failure> {
            assert!(!request.github_api);
            assert!(is_github_asset(&request.url));
            let body = include_bytes!("../../tests/fixtures/tauri-github-asset.json").to_vec();
            Ok(Response {
                url: request.url,
                status: 200,
                headers: Default::default(),
                received: body.len(),
                body,
                too_large: false,
                read_failure: None,
            })
        }
    }

    #[test]
    fn selects_darwin_and_resolves_github_asset_descriptor() {
        let url = public_url("https://example.org/v2/update.json").unwrap();
        let seed = Seed {
            name: "Viewer".into(),
            ..Seed::default()
        };
        let files = Tauri
            .parse(
                &seed,
                &url,
                include_bytes!("../../tests/fixtures/tauri-update.json"),
            )
            .unwrap();
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].version.as_deref(), Some("2.1.0"));
        assert_eq!(files[1].url, "https://example.org/v2/Viewer-x64.app.tar.gz");
        let result = Tauri
            .resolve(&files[0], &mut Context::new(&AssetFixture, None))
            .unwrap();
        assert!(result[0].url.ends_with("/Viewer-aarch64.app.tar.gz"));
        assert_eq!(result[0].format_guess.as_deref(), Some("tar.gz"));
    }
}

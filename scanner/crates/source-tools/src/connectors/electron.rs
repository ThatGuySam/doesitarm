use super::{Connector, ConnectorId, Context, asset_priority, candidate_from, join_public, yaml};
use crate::{Candidate, Failure, Seed, file_name, format_guess, public_url};
use serde::Deserialize;
use url::Url;

pub struct Electron;

#[derive(Default)]
struct Latest {
    version: Option<String>,
    files: Vec<File>,
    path: Option<String>,
}

#[derive(Default)]
struct File {
    url: String,
    size: Option<u64>,
}

#[derive(Deserialize)]
struct Squirrel {
    url: String,
    version: Option<String>,
}

impl Connector for Electron {
    fn id(&self) -> ConnectorId {
        ConnectorId::Electron
    }

    fn discover_one(
        &self,
        seed: &Seed,
        context: &mut Context<'_>,
    ) -> Result<Vec<Candidate>, Failure> {
        let target = public_url(&seed.url)?;
        let response = context.metadata(target.as_str(), false)?;
        self.parse(seed, &response.url, &response.body)
            .map_err(|error| error.with_http(response.evidence(&target)))
    }
}

impl Electron {
    fn parse(&self, seed: &Seed, base: &Url, body: &[u8]) -> Result<Vec<Candidate>, Failure> {
        let body = std::str::from_utf8(body)
            .map_err(|_| self.parse_error("invalid updater UTF-8"))?
            .trim_start_matches('\u{feff}');
        let mut manifest = if body.trim_start().starts_with('{') {
            let squirrel: Squirrel = serde_json::from_str(body)
                .map_err(|_| self.parse_error("invalid Squirrel JSON"))?;
            Latest {
                version: squirrel.version,
                path: Some(squirrel.url),
                files: Vec::new(),
            }
        } else {
            self.yaml(body)?
        };
        if manifest.files.is_empty()
            && let Some(path) = manifest.path
        {
            manifest.files.push(File {
                url: path,
                size: None,
            });
        }
        manifest.files.sort_by_key(|file| asset_priority(&file.url));
        let mut results = Vec::new();
        for file in manifest.files {
            let url = join_public(base, &file.url)?;
            if !matches!(format_guess(file_name(&url)), Some("zip" | "dmg" | "pkg")) {
                continue;
            }
            let observed = Seed {
                version: manifest.version.clone().or_else(|| seed.version.clone()),
                size: file.size,
                ..seed.clone()
            };
            results.push(candidate_from(self, seed, observed, url.as_str())?);
        }
        if results.is_empty() {
            return Err(self.parse_error("updater has no supported static macOS file"));
        }
        Ok(results)
    }

    fn yaml(&self, body: &str) -> Result<Latest, Failure> {
        let mut manifest = Latest::default();
        let mut in_files = false;
        for line in body.lines() {
            let text = line.trim();
            if text.is_empty() || text.starts_with('#') {
                continue;
            }
            if let Some(entry) = text.strip_prefix("- ")
                && in_files
            {
                let mut file = File::default();
                if let Some(("url", url)) = yaml::field(entry) {
                    file.url = url;
                }
                manifest.files.push(file);
                continue;
            }
            if line.starts_with(' ') {
                if in_files
                    && let Some((key, value)) = yaml::field(text)
                    && let Some(file) = manifest.files.last_mut()
                {
                    match key {
                        "url" => file.url = value,
                        "size" => file.size = value.parse().ok(),
                        _ => {}
                    }
                }
                continue;
            }
            let Some((key, value)) = yaml::field(text) else {
                in_files = false;
                continue;
            };
            in_files = key == "files" && value.is_empty();
            match key {
                "version" => manifest.version = Some(value),
                "path" => manifest.path = Some(value),
                _ => {}
            }
        }
        if manifest.files.iter().any(|file| file.url.is_empty()) {
            return Err(self.parse_error("updater files contains a missing or non-static URL"));
        }
        Ok(manifest)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_macos_files_and_resolves_relative_to_final_feed() {
        let url = public_url("https://example.org/v2/latest-mac.yml").unwrap();
        let seed = Seed {
            name: "Viewer".into(),
            ..Seed::default()
        };
        let files = Electron
            .parse(
                &seed,
                &url,
                include_bytes!("../../tests/fixtures/electron-latest-mac.yml"),
            )
            .unwrap();
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].url, "https://example.org/v2/Viewer-universal.zip");
        assert_eq!(files[0].version.as_deref(), Some("2.1.0"));
        assert_eq!(files[0].size, Some(112233));
        assert_eq!(files[1].url, "https://cdn.example.org/Viewer-x64.dmg");
    }
}

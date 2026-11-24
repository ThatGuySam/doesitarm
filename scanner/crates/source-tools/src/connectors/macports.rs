use super::{Connector, ConnectorId, Context, candidate_from, join_public};
use crate::{Candidate, Failure, Seed, public_url};
use url::Url;

pub struct MacPorts;

impl Connector for MacPorts {
    fn id(&self) -> ConnectorId {
        ConnectorId::Macports
    }

    fn discover_one(&self, seed: &Seed, ctx: &mut Context<'_>) -> Result<Vec<Candidate>, Failure> {
        let port = if seed.url.contains("://") {
            let url = public_url(&seed.url)?;
            if url.scheme() != "https"
                || url.host_str() != Some("packages.macports.org")
                || url.query().is_some()
            {
                return Err(self.parse_error("expected the official MacPorts binary index"));
            }
            url.path().trim_matches('/').to_owned()
        } else {
            seed.url.trim().to_owned()
        };
        if port.is_empty()
            || !port
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
            || matches!(port.as_str(), "." | "..")
        {
            return Err(self.parse_error("invalid MacPorts port name"));
        }
        let target = public_url(&format!("https://packages.macports.org/{port}/"))?;
        let response = ctx.directory(target.as_str())?;
        if response.url != target {
            return Err(self
                .parse_error("unexpected MacPorts index redirect")
                .with_http(response.evidence(&target)));
        }
        self.parse(seed, &target, &port, &response.body)
            .map_err(|error| error.with_http(response.evidence(&target)))
    }
}

impl MacPorts {
    fn parse(
        &self,
        seed: &Seed,
        base: &Url,
        port: &str,
        body: &[u8],
    ) -> Result<Vec<Candidate>, Failure> {
        let body = std::str::from_utf8(body)
            .map_err(|_| self.parse_error("invalid MacPorts index UTF-8"))?;
        let mut entries = Vec::new();
        // The Apache directory index uses double-quoted relative hrefs.
        for href in body
            .split("href=\"")
            .skip(1)
            .filter_map(|rest| rest.split('"').next())
        {
            let Some(package) = href
                .strip_prefix(&format!("{port}-"))
                .and_then(|file| file.strip_suffix(".tbz2"))
            else {
                continue;
            };
            if !href
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"-_.+%".contains(&b))
            {
                continue;
            }
            let Some((version_revision, platform)) = package.rsplit_once(".darwin_") else {
                continue;
            };
            let Some((darwin, arch)) = platform.rsplit_once('.') else {
                continue;
            };
            if !matches!(arch, "arm64" | "x86_64") {
                continue;
            }
            let Ok(darwin) = darwin.parse::<u16>() else {
                continue;
            };
            let version_revision = version_revision
                .split(['+', '%'])
                .next()
                .unwrap_or_default();
            let Some((version, revision)) = version_revision.rsplit_once('_') else {
                continue;
            };
            let Some(revision) = revision.parse::<u32>().ok() else {
                continue;
            };
            if version.is_empty()
                || seed
                    .version
                    .as_ref()
                    .is_some_and(|wanted| wanted != version)
            {
                continue;
            }
            let priority = (darwin, arch == "arm64", revision);
            entries.push((priority, version, href));
        }
        entries.sort_by(|(a, va, ha), (b, vb, hb)| {
            b.cmp(a).then_with(|| vb.cmp(va)).then_with(|| ha.cmp(hb))
        });
        if entries.is_empty() {
            return Err(Failure::new(
                "no_mac_assets",
                "mirror has no matching native Darwin binary packages",
            ));
        }
        entries
            .into_iter()
            .take(32)
            .map(|(_, version, href)| {
                let observed = Seed {
                    name: if seed.name.is_empty() {
                        port.into()
                    } else {
                        seed.name.clone()
                    },
                    vendor: "macports.org".into(),
                    version: Some(version.into()),
                    ..seed.clone()
                };
                candidate_from(self, seed, observed, join_public(base, href)?.as_str())
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_darwin_packages_from_the_binary_mirror_index() {
        let url = public_url("https://packages.macports.org/wget/").unwrap();
        let seed = Seed {
            url: "wget".into(),
            ..Seed::default()
        };
        let packages = MacPorts
            .parse(
                &seed,
                &url,
                "wget",
                include_bytes!("../../tests/fixtures/macports-wget.html"),
            )
            .unwrap();
        assert_eq!(packages.len(), 2);
        assert_eq!(packages[0].version.as_deref(), Some("1.25.0"));
        assert_eq!(packages[0].name, "wget");
        assert!(packages[0].url.ends_with("darwin_25.arm64.tbz2"));
    }
}

use super::{Connector, ConnectorId, Context, candidate_from, join_public};
use crate::{Candidate, Failure, Seed, public_url};
use std::collections::HashMap;
use url::Url;

pub struct Nix;

impl Connector for Nix {
    fn id(&self) -> ConnectorId {
        ConnectorId::Nix
    }

    fn discover_one(&self, seed: &Seed, ctx: &mut Context<'_>) -> Result<Vec<Candidate>, Failure> {
        let (platform, input) = seed.url.split_once(' ').map_or(
            (
                seed.platform.as_deref().unwrap_or_default(),
                seed.url.as_str(),
            ),
            |(system, value)| (system, value.trim()),
        );
        if !matches!(platform, "x86_64-darwin" | "aarch64-darwin") {
            return Err(
                self.parse_error("supply a pinned Darwin index entry with an explicit platform")
            );
        }
        let target = if input.contains("://") {
            public_url(input)?
        } else {
            public_url(&format!("https://cache.nixos.org/{input}.narinfo"))?
        };
        let Some(hash) = target
            .path()
            .strip_prefix('/')
            .and_then(|path| path.strip_suffix(".narinfo"))
            .filter(|hash| {
                hash.len() == 32
                    && hash
                        .bytes()
                        .all(|b| b"0123456789abcdfghijklmnpqrsvwxyz".contains(&b))
            })
        else {
            return Err(self.parse_error("invalid Nix store hash"));
        };
        if target.scheme() != "https"
            || target.host_str() != Some("cache.nixos.org")
            || target.query().is_some()
        {
            return Err(self.parse_error("expected a public cache.nixos.org narinfo"));
        }
        let response = ctx.metadata_bounded(target.as_str(), false, 128 * 1024)?;
        if response.url != target {
            return Err(self
                .parse_error("narinfo redirected outside the canonical request")
                .with_http(response.evidence(&target)));
        }
        self.parse(seed, &target, hash, &response.body)
            .map(|candidate| vec![candidate])
            .map_err(|error| error.with_http(response.evidence(&target)))
    }
}

impl Nix {
    fn parse(
        &self,
        seed: &Seed,
        base: &Url,
        hash: &str,
        body: &[u8],
    ) -> Result<Candidate, Failure> {
        let body =
            std::str::from_utf8(body).map_err(|_| self.parse_error("invalid narinfo UTF-8"))?;
        let fields: HashMap<_, _> = body
            .lines()
            .filter_map(|line| line.split_once(": "))
            .collect();
        let prefix = format!("/nix/store/{hash}-");
        let name = fields
            .get("StorePath")
            .and_then(|path| path.strip_prefix(&prefix))
            .filter(|name| !name.is_empty() && !name.contains('/'))
            .ok_or_else(|| self.parse_error("narinfo store path does not match the seed"))?;
        let link = fields
            .get("URL")
            .and_then(|url| url.strip_prefix("nar/"))
            .filter(|path| {
                !path.contains('/')
                    && path
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
                    && matches!(crate::format_guess(path), Some("nar"))
            })
            .ok_or_else(|| self.parse_error("narinfo does not expose a relative NAR URL"))?;
        let observed = Seed {
            name: if seed.name.is_empty() {
                name.into()
            } else {
                seed.name.clone()
            },
            format_guess: Some("nar".into()),
            size: fields.get("FileSize").and_then(|size| size.parse().ok()),
            ..seed.clone()
        };
        let url = join_public(base, &format!("nar/{link}"))?;
        candidate_from(self, seed, observed, url.as_str())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::{Request, Response, Traffic, Transport};

    struct RecordedCache;
    impl Transport for RecordedCache {
        fn fetch(&self, request: Request, _: &mut Traffic) -> Result<Response, Failure> {
            let body = include_bytes!("../../tests/fixtures/nix-darwin.narinfo").to_vec();
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
    fn resolves_only_pinned_darwin_store_outputs() {
        let hash = "00000000000000000000000000000000";
        let mut seed = Seed {
            url: hash.into(),
            ..Seed::default()
        };
        let mut ctx = Context::new(&RecordedCache, None);
        assert!(Nix.discover_one(&seed, &mut ctx).is_err());
        seed.platform = Some("aarch64-darwin".into());
        let files = Nix.discover_one(&seed, &mut ctx).unwrap();
        assert_eq!(files[0].format_guess.as_deref(), Some("nar"));
        assert_eq!(files[0].size, Some(1871073));
        assert!(files[0].url.ends_with(".nar.zst"));
    }
}

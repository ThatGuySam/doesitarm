use super::{Connector, ConnectorId, Context, asset_priority, candidate_from, join_public};
use crate::{Candidate, Failure, Seed, file_name, format_guess, public_url};
use roxmltree::{Document, Node};
use serde::Deserialize;
use url::Url;

pub struct Sparkle;

#[derive(Deserialize)]
struct Info {
    #[serde(rename = "SUFeedURL")]
    feed_url: String,
    #[serde(rename = "CFBundleIdentifier")]
    bundle_id: Option<String>,
    #[serde(rename = "CFBundleName")]
    name: Option<String>,
}

impl Connector for Sparkle {
    fn id(&self) -> ConnectorId {
        ConnectorId::SparkleAppcasts
    }

    fn discover_one(
        &self,
        seed: &Seed,
        context: &mut Context<'_>,
    ) -> Result<Vec<Candidate>, Failure> {
        let url = public_url(&seed.url)?;
        let response = context.metadata(url.as_str(), false)?;
        let mut observed = seed.clone();
        let response = if response.body.starts_with(b"bplist00")
            || response.body.windows(6).take(512).any(|w| w == b"<plist")
        {
            let info: Info = plist::from_bytes(&response.body).map_err(|_| {
                self.parse_error("plist does not expose SUFeedURL")
                    .with_http(response.evidence(&url))
            })?;
            observed.bundle_id = info.bundle_id.or(observed.bundle_id);
            if observed.name.is_empty() {
                observed.name = info.name.unwrap_or_default();
            }
            let feed = join_public(&response.url, &info.feed_url)?;
            context.metadata(feed.as_str(), false)?
        } else {
            response
        };
        self.parse(seed, &observed, &response.url, &response.body)
            .map_err(|e| e.with_http(response.evidence(&url)))
    }
}

impl Sparkle {
    fn parse(
        &self,
        seed: &Seed,
        observed: &Seed,
        base: &Url,
        bytes: &[u8],
    ) -> Result<Vec<Candidate>, Failure> {
        let xml =
            std::str::from_utf8(bytes).map_err(|_| self.parse_error("invalid appcast UTF-8"))?;
        let doc = Document::parse_with_options(
            xml,
            roxmltree::ParsingOptions {
                nodes_limit: 100_000,
                ..roxmltree::ParsingOptions::default()
            },
        )
        .map_err(|_| self.parse_error("invalid appcast XML"))?;
        let channel = doc
            .root_element()
            .children()
            .find(|node| node.has_tag_name("channel"))
            .ok_or_else(|| self.parse_error("no RSS channel"))?;
        for item in channel.children().filter(|node| node.has_tag_name("item")) {
            let channel_name = sparkle_element(item, "channel").unwrap_or_default();
            if !matches!(
                channel_name.to_ascii_lowercase().as_str(),
                "" | "stable" | "release" | "default"
            ) {
                continue;
            }
            let title = text(channel, "title").unwrap_or_default();
            let mut options = Vec::new();
            for enclosure in item
                .children()
                .filter(|node| node.has_tag_name("enclosure"))
            {
                let Some(link) = enclosure.attribute("url").filter(|v| !v.is_empty()) else {
                    continue;
                };
                if sparkle_attr(enclosure, "deltaFrom").is_some()
                    || enclosure.ancestors().any(|n| is_sparkle(n, "deltas"))
                {
                    continue;
                }
                if sparkle_attr(enclosure, "os")
                    .or_else(|| sparkle_element(item, "os"))
                    .is_some_and(|os| {
                        !matches!(
                            os.to_ascii_lowercase().as_str(),
                            "macos" | "osx" | "darwin" | "mac"
                        )
                    })
                {
                    continue;
                }
                let url = join_public(base, link)?;
                let filename = file_name(&url);
                if filename.to_ascii_lowercase().contains(".delta")
                    || format_guess(filename).is_none() && observed.format_guess.is_none()
                {
                    continue;
                }
                let build = sparkle_attr(enclosure, "version")
                    .or_else(|| sparkle_element(item, "version"))
                    .map(str::to_owned);
                let display = sparkle_attr(enclosure, "shortVersionString")
                    .or_else(|| sparkle_element(item, "shortVersionString"))
                    .map(str::to_owned);
                let options_seed = Seed {
                    name: if observed.name.is_empty() {
                        title.into()
                    } else {
                        observed.name.clone()
                    },
                    version: display
                        .or_else(|| build.clone())
                        .or_else(|| observed.version.clone()),
                    build_version: build.or_else(|| observed.build_version.clone()),
                    size: enclosure
                        .attribute("length")
                        .and_then(|value| value.parse().ok()),
                    minimum_system_version: sparkle_attr(enclosure, "minimumSystemVersion")
                        .or_else(|| sparkle_element(item, "minimumSystemVersion"))
                        .map(str::to_owned),
                    ..observed.clone()
                };
                options.push((
                    asset_priority(filename),
                    candidate_from(self, seed, options_seed, url.as_str())?,
                ));
            }
            if !options.is_empty() {
                options.sort_by_key(|(priority, _)| *priority);
                return Ok(options
                    .into_iter()
                    .map(|(_, candidate)| candidate)
                    .collect());
            }
        }
        Err(Failure::new(
            "no_mac_assets",
            "appcast has no stable full macOS enclosure",
        ))
    }
}

fn is_namespace(namespace: Option<&str>) -> bool {
    matches!(
        namespace,
        Some(
            "http://www.andymatuschak.org/xml-namespaces/sparkle"
                | "https://www.andymatuschak.org/xml-namespaces/sparkle"
        )
    )
}

fn is_sparkle(node: Node<'_, '_>, key: &str) -> bool {
    node.tag_name().name() == key && is_namespace(node.tag_name().namespace())
}

fn sparkle_attr<'a>(node: Node<'a, '_>, key: &str) -> Option<&'a str> {
    node.attributes()
        .find(|a| a.name() == key && is_namespace(a.namespace()))
        .map(|a| a.value())
}

fn sparkle_element<'a>(node: Node<'a, '_>, key: &str) -> Option<&'a str> {
    node.children()
        .find(|child| is_sparkle(*child, key))
        .and_then(|child| child.text())
        .map(str::trim)
}

fn text<'a>(node: Node<'a, '_>, key: &str) -> Option<&'a str> {
    node.children()
        .find(|child| child.has_tag_name(key))
        .and_then(|child| child.text())
        .map(str::trim)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::{Request, Response, Traffic, Transport};

    struct Fixture;
    impl Transport for Fixture {
        fn fetch(&self, request: Request, _: &mut Traffic) -> Result<Response, Failure> {
            let body: &[u8] = match request.url.path() {
                "/Info.plist" => include_bytes!("../../tests/fixtures/sparkle-info.plist"),
                "/releases/updates" => include_bytes!("../../tests/fixtures/sparkle-appcast.xml"),
                route => panic!("unexpected route {route}"),
            };
            Ok(Response {
                url: request.url,
                status: 200,
                body: body.into(),
                headers: [("content-type".into(), "text/html".into())].into(),
                received: body.len(),
                too_large: false,
                read_failure: None,
            })
        }
    }

    #[test]
    fn follows_sufeedurl_and_selects_full_stable_enclosure() {
        let seed = Seed {
            url: "https://example.org/Info.plist".into(),
            ..Seed::default()
        };
        let mut ctx = Context::new(&Fixture, None);
        let candidates = Sparkle.discover_one(&seed, &mut ctx).unwrap();
        assert_eq!(candidates.len(), 1);
        let app = &candidates[0];
        assert_eq!(app.url, "https://example.org/releases/files/Viewer.zip");
        assert_eq!(app.version.as_deref(), Some("2.1"));
        assert_eq!(app.build_version.as_deref(), Some("2100"));
        assert_eq!(app.minimum_system_version.as_deref(), Some("12.0"));
        assert_eq!(app.size, Some(42365));
        assert_eq!(app.bundle_id.as_deref(), Some("org.example.viewer"));
        assert_eq!(app.seed.url, seed.url);
    }
}

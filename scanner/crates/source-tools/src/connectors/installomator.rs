use super::{Connector, ConnectorId, Context, candidate_from, join_public};
use crate::{Candidate, Failure, Seed, public_url};
use std::collections::BTreeSet;

pub struct Installomator;

impl Connector for Installomator {
    fn id(&self) -> ConnectorId {
        ConnectorId::Installomator
    }

    fn discover_one(&self, seed: &Seed, ctx: &mut Context<'_>) -> Result<Vec<Candidate>, Failure> {
        let target = public_url(&seed.url)?;
        let response = ctx.metadata_bounded(target.as_str(), false, 256 * 1024)?;
        let text = std::str::from_utf8(&response.body).map_err(|_| {
            self.parse_error("invalid label UTF-8")
                .with_http(response.evidence(&target))
        })?;
        let mut names = BTreeSet::new();
        let mut links = BTreeSet::new();
        let mut dynamic = false;
        for line in text.lines().map(str::trim) {
            if let Some(value) = line.strip_prefix("name=")
                && let Some(name) = literal(value)
            {
                names.insert(name);
            }
            if let Some(value) = line.strip_prefix("downloadURL=") {
                match literal(value)
                    .filter(|value| value.starts_with("https://") || value.starts_with("http://"))
                {
                    Some(link) => {
                        links.insert(link);
                    }
                    None => dynamic = true,
                }
            }
        }
        if dynamic || links.len() != 1 {
            return Err(Failure::new(
                "recipe_requires_resolution",
                "label has no single literal downloadURL",
            )
            .with_http(response.evidence(&target)));
        }
        let link = join_public(&response.url, links.first().unwrap())?;
        let observed = Seed {
            name: if seed.name.is_empty() && names.len() == 1 {
                (*names.first().unwrap()).into()
            } else {
                seed.name.clone()
            },
            ..seed.clone()
        };
        Ok(vec![candidate_from(self, seed, observed, link.as_str())?])
    }
}

fn literal(value: &str) -> Option<&str> {
    let value = value.trim();
    let text = if let Some(quote) = value
        .chars()
        .next()
        .filter(|quote| matches!(quote, '\'' | '"'))
    {
        let (literal, trailing) = value[1..].split_once(quote)?;
        if !trailing.trim_start().is_empty() && !trailing.trim_start().starts_with('#') {
            return None;
        }
        literal
    } else {
        let trimmed = value
            .split_once(" #")
            .map_or(value, |(text, _)| text)
            .trim_end();
        if trimmed.contains(char::is_whitespace)
            || trimmed.contains([';', '|', '<', '>', '&', '*', '?', '(', ')'])
        {
            return None;
        }
        trimmed
    };
    if text.is_empty() || text.contains(['$', '`', '\\', '\n', '\r', '"', '\'']) {
        return None;
    }
    Some(text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::{Request, Response, Traffic, Transport};

    struct Fixture;
    impl Transport for Fixture {
        fn fetch(&self, request: Request, _: &mut Traffic) -> Result<Response, Failure> {
            let body: &[u8] = match request.url.path() {
                "/viewer.sh" => include_bytes!("../../tests/fixtures/installomator-viewer.sh"),
                "/dynamic.sh" => include_bytes!("../../tests/fixtures/installomator-dynamic.sh"),
                _ => panic!("unexpected route"),
            };
            Ok(Response {
                url: request.url,
                status: 200,
                headers: Default::default(),
                body: body.into(),
                received: body.len(),
                too_large: false,
                read_failure: None,
            })
        }
    }

    #[test]
    fn static_literal_only_and_never_runs_shell() {
        let mut ctx = Context::new(&Fixture, None);
        let viewer = Seed {
            url: "https://example.org/viewer.sh".into(),
            ..Seed::default()
        };
        let result = Installomator.discover_one(&viewer, &mut ctx).unwrap();
        assert_eq!(result[0].name, "Viewer for Mac");
        assert_eq!(result[0].url, "https://cdn.example.org/Viewer.dmg");
        let dynamic = Seed {
            url: "https://example.org/dynamic.sh".into(),
            ..Seed::default()
        };
        assert_eq!(
            Installomator
                .discover_one(&dynamic, &mut ctx)
                .unwrap_err()
                .class,
            "recipe_requires_resolution"
        );
    }
}

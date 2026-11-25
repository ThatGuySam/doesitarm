use super::{
    Connector, ConnectorId, Context, candidate_from, github::Github, join_public, metadata_base,
    sparkle::Sparkle, yaml,
};
use crate::{Candidate, Failure, Seed, public_url};
use plist::Value;

pub struct AutoPkg;

impl Connector for AutoPkg {
    fn id(&self) -> ConnectorId {
        ConnectorId::Autopkg
    }

    fn discover_one(
        &self,
        seed: &Seed,
        context: &mut Context<'_>,
    ) -> Result<Vec<Candidate>, Failure> {
        let target = public_url(&seed.url)?;
        let response = context.metadata_bounded(target.as_str(), false, 512 * 1024)?;
        let descriptors = self
            .parse(&response.body)
            .map_err(|error| error.with_http(response.evidence(&target)))?;
        let mut mapped = seed.clone();
        if mapped.name.is_empty()
            && let Some(name) = descriptors.name
        {
            mapped.name = name;
        }
        if let Some(link) = descriptors
            .url
            .and_then(|link| expand(&link, &descriptors.input))
        {
            return Ok(vec![candidate_from(
                self,
                seed,
                mapped,
                join_public(metadata_base(&target, &response), &link)?.as_str(),
            )?]);
        }
        let candidates = if let Some(feed) = descriptors
            .feed
            .and_then(|link| expand(&link, &descriptors.input))
        {
            mapped.url = join_public(metadata_base(&target, &response), &feed)?.into();
            Sparkle.discover_one(&mapped, context)?
        } else if let Some(repo) = descriptors
            .repo
            .and_then(|link| expand(&link, &descriptors.input))
        {
            let valid = repo.split('/').count() == 2 || repo.starts_with("https://github.com/");
            if !valid {
                return Err(self.parse_error("invalid literal GitHub repository"));
            }
            mapped.url = repo;
            Github.discover_one(&mapped, context)?
        } else {
            let detail = if descriptors.parent {
                "parent recipe or runtime processor needs resolution"
            } else {
                "no supported static URL, feed, or repository"
            };
            return Err(Failure::new("recipe_requires_resolution", detail)
                .with_http(response.evidence(&target)));
        };
        Ok(candidates
            .into_iter()
            .map(|mut candidate| {
                candidate.source = self.id().to_string();
                candidate.seed = seed.clone();
                candidate
            })
            .collect())
    }
}

#[derive(Default)]
struct Fields {
    name: Option<String>,
    url: Option<String>,
    feed: Option<String>,
    repo: Option<String>,
    parent: bool,
    input: std::collections::BTreeMap<String, String>,
}

impl Fields {
    fn set(&mut self, field: &str, value: String, input: bool) {
        if input {
            self.input.insert(field.into(), value.clone());
        }
        match field {
            "NAME" if input => self.name = Some(value),
            "DOWNLOAD_URL" | "url" => self.url = Some(value),
            "SPARKLE_FEED_URL" | "appcast_url" => self.feed = Some(value),
            "GITHUB_REPO" | "github_repo" => self.repo = Some(value),
            "ParentRecipe" if !input => self.parent = true,
            _ => {}
        }
    }
}

impl AutoPkg {
    fn parse(&self, body: &[u8]) -> Result<Fields, Failure> {
        let mut fields = Fields::default();
        if body.starts_with(b"bplist00")
            || String::from_utf8_lossy(&body[..body.len().min(32)])
                .trim_start_matches('\u{feff}')
                .trim_start()
                .starts_with('<')
        {
            let root: Value =
                plist::from_bytes(body).map_err(|_| self.parse_error("invalid AutoPkg plist"))?;
            let root = root
                .as_dictionary()
                .ok_or_else(|| self.parse_error("expected recipe dictionary"))?;
            if let Some(input) = root.get("Input").and_then(Value::as_dictionary) {
                for (field, value) in input {
                    if let Some(value) = value.as_string() {
                        fields.set(field, value.into(), true);
                    }
                }
            }
            fields.parent = root.contains_key("ParentRecipe");
            if let Some(process) = root.get("Process").and_then(Value::as_array) {
                for process in process.iter().filter_map(Value::as_dictionary) {
                    let kind = process
                        .get("Processor")
                        .and_then(Value::as_string)
                        .unwrap_or_default();
                    let key = match kind.rsplit('/').next().unwrap_or_default() {
                        "URLDownloader" => "url",
                        "SparkleUpdateInfoProvider" => "appcast_url",
                        "GitHubReleasesInfoProvider" => "github_repo",
                        _ => continue,
                    };
                    if let Some(value) = process
                        .get("Arguments")
                        .and_then(Value::as_dictionary)
                        .and_then(|args| args.get(key))
                        .and_then(Value::as_string)
                    {
                        fields.set(key, value.into(), false);
                    }
                }
            }
        } else {
            let text =
                std::str::from_utf8(body).map_err(|_| self.parse_error("invalid recipe UTF-8"))?;
            let mut input = false;
            let mut input_indent = None;
            for line in text.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with('#') || trimmed.is_empty() {
                    continue;
                }
                let indent = line.len() - line.trim_start().len();
                let Some((key, value)) = yaml::field(trimmed) else {
                    continue;
                };
                if indent == 0 {
                    input = key == "Input" && value.is_empty();
                    input_indent = None;
                    if key == "ParentRecipe" {
                        fields.parent = true;
                    }
                } else if input && *input_indent.get_or_insert(indent) == indent {
                    fields.set(key, value, true);
                }
            }
        }
        Ok(fields)
    }
}

fn expand(value: &str, keys: &std::collections::BTreeMap<String, String>) -> Option<String> {
    // AutoPkg placeholders are delimited by percent signs. URL percent escapes
    // are passed through. Recursion, shell evaluation, and inherited keys need triage.
    let mut output = String::new();
    let mut rest = value.trim();
    while let Some(index) = rest.find('%') {
        output.push_str(&rest[..index]);
        rest = &rest[index + 1..];
        if let Some(end) = rest.find('%') {
            let key = &rest[..end];
            if !key.is_empty()
                && key
                    .bytes()
                    .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || b == b'_')
                && key.bytes().any(|b| b.is_ascii_uppercase())
                && !(key.len() == 2 && key.bytes().all(|b| b.is_ascii_hexdigit()))
            {
                output.push_str(keys.get(key)?);
                rest = &rest[end + 1..];
                continue;
            }
        }
        output.push('%');
    }
    output.push_str(rest);
    if output.contains(['$', '`', '{', '}', '\n', '\r', ' ']) {
        return None;
    }
    Some(output).filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::{Request, Response, Traffic, Transport};

    struct Fixture;
    impl Transport for Fixture {
        fn fetch(&self, request: Request, _: &mut Traffic) -> Result<Response, Failure> {
            let body: &[u8] = match request.url.path() {
                "/Viewer.download.recipe" => {
                    include_bytes!("../../tests/fixtures/autopkg-download.recipe")
                }
                "/Alias.download.recipe.yaml" => {
                    include_bytes!("../../tests/fixtures/autopkg-alias.recipe.yaml")
                }
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
    fn reads_static_input_and_reports_inherited_recipe() {
        let mut ctx = Context::new(&Fixture, None);
        let seed = Seed {
            url: "https://example.org/Viewer.download.recipe".into(),
            ..Seed::default()
        };
        let result = AutoPkg.discover_one(&seed, &mut ctx).unwrap();
        assert_eq!(result[0].url, "https://cdn.example.org/Viewer%20App.dmg");
        assert_eq!(result[0].name, "Viewer");
        let alias = Seed {
            url: "https://example.org/Alias.download.recipe.yaml".into(),
            ..Seed::default()
        };
        assert_eq!(
            AutoPkg.discover_one(&alias, &mut ctx).unwrap_err().class,
            "recipe_requires_resolution"
        );
    }
}

use crate::{Context, Kind};
use serde_json::Value;
use url::Url;

fn segment(value: &str) -> bool {
    !value.is_empty()
        && value != "."
        && value != ".."
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'.' | b'_' | b'-'))
}

pub(super) fn endpoint(url: &Url) -> Option<String> {
    let host = url.host_str()?;
    let parts: Vec<_> = url.path().trim_matches('/').split('/').collect();
    if host == "gitlab.com" || host == "gitlab.gnome.org" {
        let split = parts
            .iter()
            .position(|part| *part == "-")
            .unwrap_or(parts.len());
        if split < 2
            || !parts[..split].iter().all(|part| segment(part))
            || (split < parts.len() && parts.get(split + 1) != Some(&"releases"))
        {
            return None;
        }
        return Some(format!(
            "https://{host}/api/v4/projects/{}/releases?per_page=1",
            parts[..split].join("%2F")
        ));
    }
    let [owner, repo, tail @ ..] = parts.as_slice() else {
        return None;
    };
    if !segment(owner) || !segment(repo) {
        return None;
    }
    if !matches!(
        tail,
        [] | ["releases"] | ["releases", "latest"] | ["releases", "tag", _]
    ) {
        return None;
    }
    match host {
        "github.com"
            if !matches!(
                *owner,
                "topics" | "orgs" | "settings" | "marketplace" | "features" | "sponsors"
            ) =>
        {
            let suffix = if let ["releases", "tag", tag] = tail {
                if !segment(tag) {
                    return None;
                }
                format!("tags/{tag}")
            } else {
                "latest".into()
            };
            Some(format!(
                "https://api.github.com/repos/{owner}/{repo}/releases/{suffix}"
            ))
        }
        "codeberg.org" => Some(format!(
            "https://{host}/api/v1/repos/{owner}/{repo}/releases?limit=1"
        )),
        "gitea.com" => Some(format!(
            "https://{host}/api/v1/repos/{owner}/{repo}/releases/latest"
        )),
        _ => None,
    }
}

pub(super) fn is_api(url: &Url) -> bool {
    let host = url.host_str().unwrap_or_default();
    let path = url.path();
    (host == "api.github.com" && path.starts_with("/repos/") && path.contains("/releases/"))
        || (matches!(host, "gitlab.com" | "gitlab.gnome.org")
            && path.starts_with("/api/v4/projects/")
            && path.contains("/releases"))
        || (matches!(host, "codeberg.org" | "gitea.com")
            && path.starts_with("/api/v1/repos/")
            && path.contains("/releases"))
}

pub(super) fn parse(context: &mut Context<'_>, body: &Value) {
    // Collections are ordered newest first. Ignore generated tarball_url, zipball_url and sources.
    let release = match body.as_array() {
        Some(items) => items
            .iter()
            .find(|release| release["draft"] != true && release["prerelease"] != true),
        None => {
            Some(body).filter(|release| release["draft"] != true && release["prerelease"] != true)
        }
    };
    let Some(release) = release else {
        return;
    };
    if let Some(assets) = release["assets"].as_array() {
        for (i, asset) in assets.iter().take(512).enumerate() {
            if let Some(url) = asset["browser_download_url"].as_str() {
                context.add(
                    url,
                    "metadata",
                    &format!("$.assets[{i}].browser_download_url"),
                    asset["name"].as_str().unwrap_or(""),
                    None,
                    false,
                );
            }
        }
    }
    if let Some(links) = release["assets"]["links"].as_array() {
        for (i, asset) in links.iter().take(512).enumerate() {
            let url = asset["direct_asset_url"]
                .as_str()
                .or_else(|| asset["url"].as_str());
            if let Some(url) = url {
                context.add(
                    url,
                    "metadata",
                    &format!("$.assets.links[{i}]"),
                    asset["name"].as_str().unwrap_or(""),
                    None,
                    false,
                );
            }
        }
    }
}

pub(super) fn add(context: &mut Context<'_>) {
    if let Some(endpoint) = endpoint(context.base) {
        context.add(
            &endpoint,
            "provider",
            "forge releases API",
            "",
            Some(Kind::ReleaseApi),
            false,
        );
    }
}

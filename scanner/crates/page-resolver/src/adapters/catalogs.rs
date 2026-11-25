use super::distribution::matches_host;
use crate::{Context, Kind, html, public_url};
use serde_json::Value;
use url::Url;

const CASKS: &[(&str, &str, &str)] = &[
    ("zed.dev", "/download", "zed"),
    ("lmstudio.ai", "/download", "lm-studio"),
    ("figma.com", "/downloads", "figma"),
    ("dropbox.com", "/install", "dropbox"),
    ("zoom.us", "/download", "zoom"),
    ("chatgpt.com", "/download", "chatgpt"),
];

pub(super) fn add(context: &mut Context<'_>) {
    let host = context.base.host_str().unwrap_or_default();
    let path = context.base.path().trim_end_matches('/');
    let token = CASKS
        .iter()
        .find(|(domain, route, _)| matches_host(host, domain) && path.eq_ignore_ascii_case(route))
        .map(|(_, _, token)| *token)
        .or_else(|| {
            (host == "formulae.brew.sh")
                .then(|| path.strip_prefix("/cask/"))
                .flatten()
        })
        .filter(|token| {
            !token.is_empty()
                && token
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'-' | b'@'))
        });
    if let Some(token) = token {
        context.add(
            &format!("https://formulae.brew.sh/api/cask/{token}.json"),
            "provider",
            "Homebrew cask matched to publisher and product",
            "",
            Some(Kind::ReleaseApi),
            true,
        );
    }
    if host == "go.dev" && path == "/dl" {
        context.add(
            "https://go.dev/dl/?mode=json",
            "provider",
            "Go release catalog",
            "",
            Some(Kind::ReleaseApi),
            true,
        );
    } else if matches_host(host, "zoom.us") && path == "/download" {
        context.add(
            "https://zoom.us/rest/download?os=mac",
            "provider",
            "Zoom Workplace Mac API",
            "",
            Some(Kind::ReleaseApi),
            true,
        );
    } else if host == "www.jetbrains.com" {
        let product = match path {
            "/toolbox-app" | "/toolbox-app/download" => "TBA",
            "/idea/download" => "IIU",
            _ => return,
        };
        context.add(
            &format!("https://data.services.jetbrains.com/products/releases?code={product}&latest=true&type=release"),
            "provider",
            "JetBrains product API",
            "",
            Some(Kind::ReleaseApi),
            true,
        );
    } else if host == "code.visualstudio.com" && path.eq_ignore_ascii_case("/download") {
        for (sku, label) in [
            ("arm64", "Apple Silicon"),
            ("universal", "Universal"),
            ("x64", "Intel"),
        ] {
            context.add(
                &format!(
                    "https://code.visualstudio.com/sha/download?build=stable&os=darwin-{sku}-dmg"
                ),
                "provider",
                "VS Code stable macOS desktop SKU",
                &format!("Download macOS {label}"),
                Some(Kind::Redirect),
                true,
            );
        }
    } else if matches!(host, "kodi.tv" | "www.kodi.tv") && path == "/download/macos" {
        let source: Vec<_> = context.candidates.keys().cloned().collect();
        for url in source {
            if url.host_str() != Some(host) || !url.path().starts_with("/download/thanks/macos") {
                continue;
            }
            if let Some((_, raw)) = url.query_pairs().find(|(key, _)| key == "url") {
                if let Some(download) = public_url(&raw, None).filter(|url| {
                    url.host_str() == Some("mirrors.kodi.tv")
                        && url.path().starts_with("/releases/osx/")
                        && url.path().ends_with(".dmg")
                }) {
                    context.add(
                        download.as_str(),
                        "provider",
                        "Kodi mirror URL in thank-you action",
                        "",
                        None,
                        true,
                    );
                }
            }
        }
    }
}

pub(super) fn declared_script(context: &mut Context<'_>, raw: &str) {
    if let Some(url) = public_url(raw, Some(context.base)).filter(is_config) {
        if url.host_str() == context.base.host_str() {
            context.add(
                url.as_str(),
                "provider",
                "script[src] published download configuration",
                "",
                Some(Kind::ReleaseApi),
                true,
            );
        }
    }
}

pub(super) fn is_config(url: &Url) -> bool {
    matches!(
        (url.host_str(), url.path()),
        (Some("openscad.org"), "/inc/releases.js") | (Some("openemu.org"), "/data.js")
    )
}

pub(super) fn parse(context: &mut Context<'_>, body: &Value) -> bool {
    let host = context.base.host_str().unwrap_or_default();
    let path = context.base.path();
    if host == "formulae.brew.sh" && path.starts_with("/api/cask/") {
        let Some(token) = path
            .strip_prefix("/api/cask/")
            .and_then(|p| p.strip_suffix(".json"))
        else {
            return true;
        };
        if body["token"].as_str().is_some_and(|value| value != token) {
            return true;
        }
        let homepage = body["homepage"]
            .as_str()
            .and_then(|raw| public_url(raw, None));
        if homepage.is_none()
            || CASKS
                .iter()
                .filter(|(_, _, name)| *name == token)
                .any(|(domain, _, _)| {
                    !homepage
                        .as_ref()
                        .and_then(Url::host_str)
                        .is_some_and(|host| matches_host(host, domain))
                })
        {
            return true;
        }
        if let Some(url) = body["url"].as_str() {
            context.add(url, "metadata", "$.url", "macOS cask download", None, true);
        }
        if let Some(variants) = body["variations"].as_object() {
            for (label, v) in variants.iter().take(64) {
                if let Some(url) = v["url"].as_str() {
                    let arch = if label.starts_with("arm64_") {
                        "arm64"
                    } else {
                        "Intel"
                    };
                    context.add(
                        url,
                        "metadata",
                        &format!("$.variations.{label}.url"),
                        &format!("macOS {arch}"),
                        None,
                        true,
                    );
                }
            }
        }
    } else if host == "zoom.us" && path == "/rest/download" {
        let downloads = &body["result"]["downloadVO"];
        for (key, arch) in [("zoomArm64", "arm64"), ("zoom", "Intel")] {
            if let (Some(version), Some(name)) = (
                downloads[key]["version"].as_str(),
                downloads[key]["packageName"].as_str(),
            ) {
                if !version.is_empty()
                    && version.bytes().all(|c| c.is_ascii_digit() || c == b'.')
                    && name == "zoomusInstallerFull.pkg"
                {
                    let query = if arch == "arm64" {
                        "?archType=arm64"
                    } else {
                        ""
                    };
                    context.add(
                        &format!("https://zoom.us/client/{version}/{name}{query}"),
                        "metadata",
                        &format!("$.result.downloadVO.{key}"),
                        arch,
                        None,
                        true,
                    );
                }
            }
        }
    } else if host == "go.dev" && path == "/dl/" {
        if let Some(files) = body.get(0).and_then(|r| r["files"].as_array()) {
            for file in files
                .iter()
                .take(256)
                .filter(|v| v["kind"] == "installer" && v["os"] == "darwin")
            {
                if let Some(name) = file["filename"]
                    .as_str()
                    .filter(|name| name.ends_with(".pkg") && !name.contains(['/', '?', '#']))
                {
                    context.add(
                        name,
                        "metadata",
                        "$[0].files[darwin installer]",
                        "macOS installer",
                        None,
                        true,
                    );
                }
            }
        }
    } else if host == "data.services.jetbrains.com" && path == "/products/releases" {
        let Some(product) = context.base.query_pairs().find_map(|(key, value)| {
            (key == "code" && matches!(value.as_ref(), "TBA" | "IIU")).then(|| value.into_owned())
        }) else {
            return true;
        };
        for (key, arch) in [("macM1", "arm64"), ("mac", "Intel")] {
            if let Some(link) = body[product.as_str()][0]["downloads"][key]["link"].as_str() {
                context.add(
                    link,
                    "metadata",
                    &format!("$.{product}[0].downloads.{key}.link"),
                    arch,
                    None,
                    true,
                );
            }
        }
    } else if is_config(context.base) {
        if let Some(matches) = body["matches"].as_array() {
            for row in matches.iter().take(64) {
                if let Some(text) = row["text"].as_str() {
                    html::script_literals(
                        context,
                        &format!("{text}'"),
                        "published download configuration",
                        true,
                    );
                }
            }
        }
    } else {
        return false;
    }
    true
}

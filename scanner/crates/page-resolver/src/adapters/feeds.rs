use super::distribution::matches_host;
use crate::{Context, Kind, short};
use quick_xml::{Reader, events::Event};
use serde_json::Value;
use url::Url;

pub(super) fn is_mac_yaml(path: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or("");
    (name.ends_with(".yml") || name.ends_with(".yaml"))
        && ["latest-mac", "stable-mac", "latest-darwin"]
            .iter()
            .any(|prefix| name.starts_with(prefix))
}

pub(super) fn is_feed(path: &str, mime: &str) -> bool {
    matches!(mime, "application/rss+xml" | "application/atom+xml")
        || is_mac_yaml(path)
        || path.ends_with("/latest.json")
        || path.ends_with("/release.json")
        || path.ends_with("appcast.xml")
        || path.ends_with("appcast.rss")
        || path.ends_with("/downloads/updates.xml")
}

pub(super) fn declared_provider(page: &Url, endpoint: &Url) -> bool {
    let publisher = page.host_str().unwrap_or_default();
    let host = endpoint.host_str().unwrap_or_default();
    matches!(
        (publisher, host),
        ("signal.org", "updates.signal.org")
            | ("www.usebruno.com", "github.com")
            | ("www.jan.ai", "github.com")
            | ("jan.ai", "github.com")
            | ("iina.io", "www.iina.io")
            | ("cyberduck.io", "version.cyberduck.io")
            | ("www.electronjs.org", "update.electronjs.org")
    ) && (host != "github.com"
        || endpoint.path().starts_with("/usebruno/bruno/")
        || endpoint.path().starts_with("/janhq/jan/"))
}

pub(super) fn known(context: &mut Context<'_>) {
    let host = context.base.host_str().unwrap_or_default();
    let path = context.base.path().trim_end_matches('/');
    let endpoint = match (host, path) {
        ("signal.org", "/download") => "https://updates.signal.org/desktop/latest-mac.yml",
        ("rectangleapp.com", "") => "https://rectangleapp.com/downloads/updates.xml",
        ("www.usebruno.com", "/downloads") => {
            "https://github.com/usebruno/bruno/releases/latest/download/latest-mac.yml"
        }
        ("www.jan.ai" | "jan.ai", "/download") => {
            "https://github.com/janhq/jan/releases/latest/download/latest.json"
        }
        ("iina.io" | "www.iina.io", "") => "https://www.iina.io/appcast.xml",
        ("cyberduck.io", "/download") => "https://version.cyberduck.io/changelog.rss",
        ("github.com", "/electron/fiddle") => {
            "https://update.electronjs.org/electron/fiddle/darwin-arm64/0.0.0"
        }
        ("www.electronjs.org", "/fiddle") => {
            "https://update.electronjs.org/electron/fiddle/darwin-arm64/0.38.0"
        }
        _ => return,
    };
    context.add(
        endpoint,
        "provider",
        "publisher Mac update manifest",
        "",
        Some(Kind::Feed),
        true,
    );
}

pub(super) fn json(context: &mut Context<'_>, body: &Value, declared_mac: bool) -> bool {
    if let Some(platforms) = body["platforms"].as_object() {
        for (platform, entry) in platforms
            .iter()
            .take(64)
            .filter(|(key, _)| key.starts_with("darwin-"))
        {
            if let Some(url) = entry["url"].as_str() {
                context.add(
                    url,
                    "metadata",
                    &format!("$.platforms.{platform}.url"),
                    platform,
                    None,
                    true,
                );
            }
        }
        return true;
    }
    if (declared_mac || is_mac_yaml(context.base.path())) && body["files"].is_array() {
        for (i, file) in body["files"]
            .as_array()
            .unwrap()
            .iter()
            .take(64)
            .enumerate()
        {
            if let Some(url) = file["url"].as_str() {
                context.add(
                    &release_asset(context.base, url, body["version"].as_str()),
                    "metadata",
                    &format!("$.files[{i}].url"),
                    "macOS update feed",
                    None,
                    true,
                );
            }
        }
        return true;
    }
    if matches_host(
        context.base.host_str().unwrap_or_default(),
        "update.electronjs.org",
    ) && context.base.path().contains("/darwin-")
    {
        if let Some(url) = body["url"].as_str() {
            context.add(url, "metadata", "$.url", context.base.path(), None, true);
        }
        return true;
    }
    // The research captures represent Sparkle XML as a JSON object.
    let items = body["channel"]["items"]
        .as_array()
        .or_else(|| body["items"].as_array());
    if let Some(item) = items.and_then(|items| items.first()) {
        if let Some(url) = item["enclosure"]["url"].as_str() {
            context.add(
                url,
                "metadata",
                "$.items[0].enclosure.url",
                "Sparkle full update",
                None,
                declared_mac,
            );
            return true;
        }
    }
    false
}

// GitHub's CDN Location loses the versioned Downloads directory. A version
// from the selected release manifest can address its relative assets directly.
fn release_asset(base: &Url, file: &str, version: Option<&str>) -> String {
    if base.host_str() != Some("github.com")
        || file.starts_with('.')
        || file.contains(['/', '?', '#'])
    {
        return file.to_owned();
    }
    let Some((project, _)) = base.path().split_once("/releases/latest/download/") else {
        return file.to_owned();
    };
    let Some(version) = version.filter(|v| {
        !v.is_empty()
            && v.len() < 30
            && v.split('.')
                .all(|part| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit()))
    }) else {
        return file.to_owned();
    };
    format!("https://github.com{project}/releases/download/v{version}/{file}")
}

/// Admit only scalar file URLs in the published Electron-builder subset.
pub(super) fn yaml(context: &mut Context<'_>, bytes: &[u8]) {
    let Ok(body) = std::str::from_utf8(bytes) else {
        return;
    };
    let version = body.lines().take(64).find_map(|line| {
        line.strip_prefix("version:")
            .map(|value| value.trim().trim_matches(['\'', '"']))
    });
    let mut files = false;
    for (i, line) in body.lines().take(2048).enumerate() {
        if line.trim_end() == "files:" {
            files = true;
            continue;
        }
        if !line.starts_with([' ', '\t']) && !line.trim().is_empty() {
            files = false;
        }
        if !files {
            continue;
        }
        if let Some(url) = line
            .trim()
            .strip_prefix("- url:")
            .map(|value| value.trim().trim_matches(['\'', '"']))
        {
            if url.len() <= 4096
                && !url.starts_with(['&', '*', '!', '|', '>'])
                && !url.contains(char::is_whitespace)
            {
                context.add(
                    &release_asset(context.base, url, version),
                    "metadata",
                    &format!("files[].url (line {})", i + 1),
                    "macOS update feed",
                    None,
                    true,
                );
            }
        }
    }
}

pub(super) fn xml(context: &mut Context<'_>, bytes: &[u8]) {
    let mut reader = Reader::from_reader(bytes);
    let mut stack = Vec::new();
    let mut enclosures = Vec::new();
    let mut found_item = false;
    for _ in 0..20_000 {
        let event = match reader.read_event() {
            Ok(Event::Eof) => break,
            Ok(Event::DocType(_)) | Err(_) => return,
            Ok(event) => event,
        };
        match event {
            Event::Start(ref tag) | Event::Empty(ref tag) => {
                let qualified = tag.name();
                let name = qualified.as_ref();
                if stack.len() >= 64 || name.len() > 80 {
                    return;
                }
                if name == "item" && found_item && !enclosures.is_empty() {
                    break;
                }
                if name == "item" {
                    found_item = true;
                }
                if name == "enclosure"
                    && found_item
                    && !stack.iter().any(|ancestor| ancestor == "sparkle:deltas")
                {
                    let mut url = None;
                    let mut labels = String::new();
                    let mut delta = false;
                    for (i, attr) in tag.attributes().enumerate() {
                        let Ok(attr) = attr else {
                            return;
                        };
                        if i >= 64 || attr.value.len() > 8192 {
                            return;
                        }
                        match attr.key.as_ref() {
                            "sparkle:deltaFrom" => delta = true,
                            "url" => {
                                url = attr
                                    .normalized_value(quick_xml::XmlVersion::Implicit1_0)
                                    .ok()
                                    .map(|u| u.into_owned())
                            }
                            "sparkle:os" | "sparkle:arch" => labels.push_str(&short(
                                &attr
                                    .normalized_value(quick_xml::XmlVersion::Implicit1_0)
                                    .unwrap_or_default(),
                                70,
                            )),
                            _ => {}
                        }
                    }
                    if let Some(url) = url.filter(|_| !delta && enclosures.len() < 16) {
                        enclosures.push((url, labels));
                    }
                }
                if matches!(event, Event::Start(_)) {
                    stack.push(name.to_owned());
                }
            }
            Event::End(_) => {
                stack.pop();
            }
            _ => {}
        }
    }
    for (url, labels) in enclosures {
        context.add(
            &url,
            "metadata",
            "/rss/channel/item/enclosure[@url]",
            &labels,
            None,
            context.base.path().contains("appcast") || !labels.is_empty() && labels.contains("mac"),
        );
    }
}

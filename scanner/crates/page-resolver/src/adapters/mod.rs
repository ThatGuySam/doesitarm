mod catalogs;
pub mod distribution;
mod feeds;
mod forges;

use crate::{Context, Kind, MAX_METADATA_BYTES, html, public_url};
use serde_json::Value;

pub fn discover(context: &mut Context<'_>) {
    forges::add(context);
    catalogs::add(context);
    feeds::known(context);
}

pub fn declared_script(context: &mut Context<'_>, url: &str) {
    catalogs::declared_script(context, url);
}

pub fn feed_hint(context: &mut Context<'_>, raw: &str, selector: &str, mime: &str) {
    let Some(url) = public_url(raw, Some(context.base)) else {
        return;
    };
    let path = url.path().to_ascii_lowercase();
    if !same_site(context.base, &url)
        && !feeds::declared_provider(context.base, &url)
        && !forges::is_api(&url)
    {
        return;
    }
    let (kind, mac) = if forges::is_api(&url) {
        // A linked forge API can only point to a repo explicitly named by this page.
        (Kind::ReleaseApi, false)
    } else if feeds::is_feed(&path, mime) {
        (
            Kind::Feed,
            path.contains("mac") || path.contains("darwin") || path.contains("appcast"),
        )
    } else {
        return;
    };
    context.add(url.as_str(), "provider", selector, "", Some(kind), mac);
}

fn same_site(a: &url::Url, b: &url::Url) -> bool {
    a.host_str().map(|host| host.trim_start_matches("www."))
        == b.host_str().map(|host| host.trim_start_matches("www."))
}

pub fn header_links(context: &mut Context<'_>, value: &str) {
    for part in value.split(',').take(16) {
        let Some((url, rest)) = part
            .trim()
            .strip_prefix('<')
            .and_then(|tail| tail.split_once('>'))
        else {
            continue;
        };
        if rest.contains("rel=alternate") || rest.contains("rel=\"alternate\"") {
            feed_hint(context, url, "Link: alternate", "");
        } else if rest.contains("rel=download") || rest.contains("rel=\"download\"") {
            context.add(url, "header", "Link: download", "Download", None, false);
        }
    }
}

pub fn metadata(
    context: &mut Context<'_>,
    bytes: &[u8],
    media_type: &str,
    declared_mac: Option<bool>,
) {
    if bytes.len() > MAX_METADATA_BYTES {
        context.features.limit_hit = true;
        return;
    }
    let media_type = media_type.split(';').next().unwrap_or("").trim();
    if let Ok(value) = serde_json::from_slice::<Value>(bytes) {
        if forges::is_api(context.base) {
            forges::parse(context, &value);
        } else if !catalogs::parse(context, &value)
            && !feeds::json(context, &value, declared_mac.unwrap_or(false))
        {
            inline_value(context, &value, "JSON response");
        }
    } else if matches!(
        media_type,
        "application/xml" | "text/xml" | "application/rss+xml" | "application/atom+xml"
    ) || bytes.iter().find(|b| !b.is_ascii_whitespace()) == Some(&b'<')
    {
        feeds::xml(context, bytes);
    } else if feeds::is_mac_yaml(context.base.path()) {
        feeds::yaml(context, bytes);
    } else if catalogs::is_config(context.base) {
        if let Ok(script) = std::str::from_utf8(bytes) {
            html::script_literals(context, script, "published download configuration", true);
        }
    }
}

pub fn inline_json(context: &mut Context<'_>, bytes: &[u8], selector: &str) {
    if bytes.len() <= MAX_METADATA_BYTES {
        if let Ok(value) = serde_json::from_slice(bytes) {
            inline_value(context, &value, selector);
        }
    }
}

pub fn inline_value(context: &mut Context<'_>, value: &Value, selector: &str) {
    let mut visited = 0;
    walk(context, value, selector, "", 0, &mut visited);
}

fn walk(
    context: &mut Context<'_>,
    value: &Value,
    path: &str,
    label: &str,
    depth: usize,
    visited: &mut usize,
) {
    *visited += 1;
    if depth >= 64 || *visited > 30_000 || path.len() > 512 {
        return;
    }
    match value {
        Value::Object(object) => {
            let sibling = [
                "platform",
                "os",
                "operatingSystem",
                "architecture",
                "arch",
                "name",
                "filename",
            ]
            .into_iter()
            .filter_map(|key| object.get(key)?.as_str())
            .map(|s| crate::short(s, 60))
            .collect::<Vec<_>>()
            .join(" ");
            let label = format!("{} {}", crate::short(label.trim(), 110), sibling);
            for (key, value) in object {
                if *visited >= 30_000 {
                    break;
                }
                let normalized = key.to_ascii_lowercase();
                if normalized.contains("checksum")
                    || matches!(
                        normalized.as_str(),
                        "signature" | "zipball_url" | "tarball_url"
                    )
                {
                    continue;
                }
                let path = format!("{path}.{}", crate::short(key, 90));
                if let Some(url) = value.as_str().filter(|url| url.len() <= 4096) {
                    let named = normalized.contains("download")
                        || matches!(
                            normalized.as_str(),
                            "url"
                                | "href"
                                | "link"
                                | "installer"
                                | "package"
                                | "mac"
                                | "macos"
                                | "darwin"
                                | "macarm"
                                | "macintel"
                        );
                    if named
                        && !url.contains([' ', '\n', '\r'])
                        && (url.contains('/') || url.contains('.'))
                    {
                        context.add(
                            url,
                            "inline_json",
                            &path,
                            &format!("{label} {key}"),
                            None,
                            false,
                        );
                    }
                } else {
                    let platform_key = if normalized.contains("mac")
                        || normalized.contains("darwin")
                        || normalized.contains("silicon")
                    {
                        format!("{label} {key}")
                    } else {
                        label.clone()
                    };
                    walk(context, value, &path, &platform_key, depth + 1, visited);
                }
            }
        }
        Value::Array(array) => {
            for (index, value) in array.iter().enumerate() {
                if *visited >= 30_000 {
                    break;
                }
                walk(
                    context,
                    value,
                    &format!("{path}[{index}]"),
                    label,
                    depth + 1,
                    visited,
                );
            }
        }
        _ => {}
    }
}

pub fn direct_target(url: &url::Url) -> Option<String> {
    distribution::root_share(url).map(|url| url.to_string())
}

use crate::{Hint, Kind};
use url::Url;

pub(super) fn matches_host(host: &str, domain: &str) -> bool {
    host == domain
        || host
            .strip_suffix(domain)
            .is_some_and(|prefix| prefix.ends_with('.'))
}

pub fn share_host(url: &Url) -> bool {
    let host = url.host_str().unwrap_or_default();
    [
        "dropbox.com",
        "dropboxusercontent.com",
        "drive.google.com",
        "drive.usercontent.google.com",
        "mediafire.com",
        "1drv.ms",
        "onedrive.live.com",
        "mega.nz",
        "mega.io",
    ]
    .iter()
    .any(|domain| matches_host(host, domain))
}

fn is_store(url: &Url) -> bool {
    matches!(url.host_str(), Some("apps.apple.com" | "itunes.apple.com"))
        && url
            .path_segments()
            .is_some_and(|mut parts| parts.any(|part| part == "app"))
}

fn storefront(url: &Url) -> bool {
    let host = url.host_str().unwrap_or_default();
    [
        "gumroad.com",
        "fastspring.com",
        "pay.paddle.com",
        "lemonsqueezy.com",
        "testflight.apple.com",
        "setapp.com",
        "accounts.google.com",
        "mega.nz",
        "onedrive.live.com",
        "1drv.ms",
    ]
    .iter()
    .any(|domain| matches_host(host, domain))
        || (host.ends_with(".itch.io") && !host.starts_with("www."))
}

pub fn gate(url: &Url, status: Option<u16>) -> Option<&'static str> {
    let host = url.host_str().unwrap_or_default();
    let path = url.path();
    if is_store(url) {
        return Some("app_store");
    }
    if status.is_some_and(|status| matches!(status, 401 | 403 | 429 | 451)) {
        return Some("access_restricted");
    }
    if storefront(url) {
        return Some("vendor_action");
    }
    // Known publishers expose otherwise plausible artifacts inside their required forms.
    if (host == "developer.android.com" && path.trim_end_matches('/') == "/studio")
        || (matches_host(host, "synaptics.com")
            && path.contains("displaylink")
            && path.contains("download"))
        || (matches_host(host, "java.com") && path.contains("/download/"))
        || (host == "tools.hana.ondemand.com")
        || (host == "developer.apple.com" && path.starts_with("/download"))
        || (matches_host(host, "blackmagicdesign.com") && path.contains("davinciresolve"))
        || (matches_host(host, "splunk.com") && path.contains("download"))
        || (matches_host(host, "parallels.com") && path.contains("trial"))
    {
        return Some("vendor_action");
    }
    None
}

pub fn rewrite(mut url: Url, mut hint: Hint) -> (Url, Hint) {
    if is_store(&url) {
        hint.kind = Some(Kind::AppStore);
    } else if storefront(&url) {
        hint.kind = Some(Kind::Gated);
    } else if matches!(url.host_str(), Some("www.dropbox.com" | "dropbox.com"))
        && (url.path().starts_with("/s/") || url.path().starts_with("/scl/fi/"))
    {
        let params: Vec<_> = url
            .query_pairs()
            .into_owned()
            .filter(|(key, _)| key != "dl" && key != "raw")
            .collect();
        url.query_pairs_mut()
            .clear()
            .extend_pairs(params)
            .append_pair("dl", "1");
        hint.kind = Some(Kind::Redirect);
    } else if matches!(
        url.host_str(),
        Some("drive.google.com" | "drive.usercontent.google.com")
    ) {
        if url.path() == "/uc"
            && url
                .query_pairs()
                .any(|(k, v)| k == "export" && v == "download")
        {
            hint.kind = Some(Kind::Redirect);
        } else {
            // A preview or warning is a vendor handoff. Never add confirmation fields.
            hint.kind = Some(Kind::Gated);
        }
    } else if url.host_str() == Some("www.mediafire.com") && url.path().starts_with("/file/") {
        hint.kind = Some(Kind::Redirect);
    } else if is_sourceforge_file(&url) {
        hint.kind = Some(Kind::Redirect);
    }
    (url, hint)
}

fn is_sourceforge_file(url: &Url) -> bool {
    url.host_str() == Some("sourceforge.net")
        && url.path().starts_with("/projects/")
        && url.path().contains("/files/")
        && url.path().ends_with("/download")
}

pub fn root_share(url: &Url) -> Option<Url> {
    let hint = Hint {
        raw: url.to_string(),
        kind: None,
        mac_context: false,
        evidence: crate::Evidence {
            source: "provider",
            selector: String::new(),
            text: String::new(),
        },
    };
    let (rewritten, _) = rewrite(url.clone(), hint);
    (rewritten != *url).then_some(rewritten)
}

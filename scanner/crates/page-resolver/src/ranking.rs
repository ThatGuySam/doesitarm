use crate::{Arch, Candidate, Hint, Kind, Os};
use percent_encoding::percent_decode_str;
use regex::Regex;
use std::sync::LazyLock;
use url::Url;

pub const ELIGIBLE: i32 = 48;
pub const FOLLOW: i32 = 34;

static MAC: LazyLock<Regex> = LazyLock::new(|| {
    regex(
        r"\b(?:mac(?:os|intosh|osx)?|os[ _-]?x|darwin|apple[ _-]?silicon|apple[ _-]m[1-9]|mac[ _-]?arm64)\b",
    )
});
static OTHER: LazyLock<Regex> = LazyLock::new(|| {
    regex(
        r"\b(?:windows|win32|win64|win[ _-](?:x64|arm64)|linux|ubuntu|debian|android|freebsd|ios|appimage)\b",
    )
});
static ACQUIRE: LazyLock<Regex> =
    LazyLock::new(|| regex(r"download|installer|install\b|\.pkg\b|\.dmg\b"));
static ARM: LazyLock<Regex> =
    LazyLock::new(|| regex(r"\b(?:arm64|aarch64|apple[ _-]?silicon|apple[ _-]m[1-9])\b"));
static INTEL: LazyLock<Regex> = LazyLock::new(|| regex(r"\b(?:x86[_-]64|x64|amd64|intel)\b"));
static UNIVERSAL: LazyLock<Regex> = LazyLock::new(|| regex(r"\buniversal(?:2|[-_ ]?binary)?\b"));
static DECOY: LazyLock<Regex> = LazyLock::new(|| {
    regex(
        r"(?:/archive/(?:refs/|v?[0-9])|/tarball/|/zipball/|/repository/archive|\bsource[ _-]?code\b|\b(?:src|sources|checksums?|sha256|sha512|md5|signatures?)\b|release[ _-]?notes|press[ _-]?kit|\.(?:asc|sig|minisig|sha256|sha512|torrent|blockmap|zsync)(?:$|[? /]))",
    )
});
static STALE: LazyLock<Regex> = LazyLock::new(|| {
    regex(
        r"\b(?:nightly|beta|alpha|preview|legacy|historical|snapshot|canary|prerelease|unofficial|unsupported)\b|\bold(er)?[ -]versions\b",
    )
});
static NON_MAC_FILE: LazyLock<Regex> =
    LazyLock::new(|| regex(r"\.(?:exe|msi|msix|deb|rpm|appimage|apk|nupkg|7z)(?:$|[?&/ ])"));
static RECOGNIZED: LazyLock<Regex> =
    LazyLock::new(|| regex(r"\.(?:app\.zip|dmg|pkg|zip|tar\.gz|tgz)$"));
static ARCH_WORDS: LazyLock<Regex> = LazyLock::new(|| {
    regex(r"arm64|aarch64|apple[ _-]?silicon|x86[_-]64|x64|amd64|intel|universal2?|macos|darwin")
});
static SEPARATORS: LazyLock<Regex> = LazyLock::new(|| regex(r"[/_. -]+"));

fn regex(pattern: &str) -> Regex {
    Regex::new(pattern).expect("built-in ranking pattern")
}

fn normalized(value: &str) -> String {
    percent_decode_str(value)
        .decode_utf8_lossy()
        .to_ascii_lowercase()
        .replace('_', " ")
        .replace("x86 64", "x86-64")
}

pub fn rank(url: Url, hint: Hint) -> Option<Candidate> {
    let path = normalized(url.path());
    let text = normalized(&hint.evidence.text);
    let query = normalized(url.query().unwrap_or(""));
    let url_labels = format!("{path} {query}");
    let labels = format!("{url_labels} {text}");
    let download_path = path
        .trim_end_matches('/')
        .strip_suffix("/download")
        .unwrap_or(&path);
    let dmg_pkg = download_path.ends_with(".dmg") || download_path.ends_with(".pkg");
    let supported = RECOGNIZED.is_match(download_path);
    let named_archive = ARCH_WORDS.replace_all(download_path, "");
    let mac = hint.mac_context || MAC.is_match(&labels) || dmg_pkg;
    let wrong_os = NON_MAC_FILE.is_match(&url_labels)
        || OTHER.is_match(&url_labels)
        || (!mac && OTHER.is_match(&text));
    let arch = [url_labels.as_str(), text.as_str()]
        .into_iter()
        .find_map(|label| {
            let arm = ARM.is_match(label);
            let intel = INTEL.is_match(label);
            if UNIVERSAL.is_match(label) {
                Some(Arch::Universal)
            } else if arm && !intel {
                Some(Arch::Arm64)
            } else if intel && !arm {
                Some(Arch::X86_64)
            } else {
                None
            }
        })
        .unwrap_or(Arch::Unknown);

    if let Some(kind @ (Kind::AppStore | Kind::Gated | Kind::Feed | Kind::ReleaseApi)) = hint.kind {
        return Some(Candidate {
            url,
            score: if matches!(kind, Kind::Feed | Kind::ReleaseApi) {
                43
            } else {
                12
            },
            reasons: vec![match kind {
                Kind::AppStore => "app_store_handoff",
                Kind::Gated => "vendor_handoff",
                Kind::Feed => "declared_update_feed",
                _ => "public_release_api",
            }],
            arch,
            os: if mac { Os::Macos } else { Os::Unknown },
            kind,
            evidence: hint.evidence,
        });
    }
    if DECOY.is_match(&url_labels)
        || DECOY.is_match(&text)
        || wrong_os
        || labels.contains("sparkle:deltafrom")
        || labels.contains("font installer")
        || path.contains("/fonthelper")
        || path.ends_with(".zip.sig")
        || named_archive.ends_with(".patch")
    {
        return None;
    }
    let acquisition = ACQUIRE.is_match(&labels) || hint.evidence.selector.contains("[download]");
    if !supported
        && !hint
            .kind
            .is_some_and(|kind| matches!(kind, Kind::Redirect | Kind::InstallerStub))
        && !(mac && acquisition)
    {
        return None;
    }

    let mut score = 0;
    let mut reasons = Vec::new();
    let mut add = |n, why| {
        score += n;
        reasons.push(why);
    };
    if dmg_pkg {
        add(52, "mac_package_suffix");
    } else if supported {
        add(25, "archive_suffix");
    } else {
        add(10, "opaque_download");
    }
    if MAC.is_match(&url_labels) {
        add(33, "mac_platform_in_url");
    } else if MAC.is_match(&text) || hint.mac_context || (dmg_pkg && arch != Arch::Unknown) {
        add(30, "mac_platform_in_context");
    }
    if acquisition {
        add(11, "download_action");
    }
    if hint.evidence.source == "html" {
        add(7, "visible_control");
    }
    if hint.evidence.source == "metadata" {
        add(4, "structured_release_asset");
    }
    if hint.kind == Some(Kind::Redirect) {
        let refresh = hint.evidence.selector == "meta[http-equiv=refresh]";
        add(if refresh { 23 } else { 11 }, "declared_redirect");
    }
    if hint.evidence.source == "script" {
        add(-9, "literal_script_only");
    }
    if hint.evidence.source == "inline_json" {
        add(-2, "embedded_state");
    }
    if STALE.is_match(&labels) {
        add(-27, "nonstable_or_legacy");
    }
    if labels.contains("/releases/latest/") || labels.contains("latest stable") {
        add(5, "latest_release");
    }
    if labels.contains("updater") || labels.contains(".app.tar.gz") || labels.contains("/updates/")
    {
        add(-12, "update_archive");
    }
    if labels.contains("sdk") || labels.contains("helper") || labels.contains("command line") {
        add(-15, "secondary_component");
    }
    if mac || dmg_pkg {
        match arch {
            Arch::Arm64 => add(9, "apple_silicon"),
            Arch::Universal => add(6, "universal_build"),
            Arch::X86_64 => add(2, "intel_build"),
            Arch::Unknown => (),
        }
    } else {
        add(-13, "platform_unclear");
    }

    let os = if mac { Os::Macos } else { Os::Unknown };
    let kind = if hint.kind == Some(Kind::InstallerStub)
        || text.contains("online installer")
        || text.contains("bootstrapper")
    {
        Kind::InstallerStub
    } else if supported && !path.ends_with("/download") {
        Kind::DirectFile
    } else {
        Kind::Redirect
    };
    Some(Candidate {
        url,
        score,
        reasons,
        arch,
        os,
        kind,
        evidence: hint.evidence,
    })
}

fn product_key(url: &Url) -> String {
    let path = url.path().trim_end_matches('/');
    let filename = path.rsplit('/').next().unwrap_or(path);
    let name = if filename == "download" || filename.is_empty() {
        path
    } else {
        filename
    };
    let name = ARCH_WORDS
        .replace_all(&name.to_ascii_lowercase(), "")
        .into_owned();
    SEPARATORS.replace_all(&name, "-").into_owned()
}

pub fn unclear(best: &Candidate, second: &Candidate) -> bool {
    // Prefer the ARM build even if its Intel sibling has a slightly different label.
    let variants = best.arch != Arch::Unknown
        && second.arch != Arch::Unknown
        && best.arch != second.arch
        && best.url.host_str() == second.url.host_str()
        && product_key(&best.url) == product_key(&second.url)
        && best.url.path() != "/";
    !variants && best.score - second.score <= 18
}

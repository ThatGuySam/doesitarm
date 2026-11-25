use page_resolver::{
    Arch, Decision, Document, Headers, Kind, MAX_DOCUMENT_BYTES, public_url, resolve,
};

fn document<'a>(url: &'a url::Url, bytes: &'a [u8], content_type: &'a str) -> Document<'a> {
    Document {
        url,
        bytes,
        headers: Headers {
            status: Some(200),
            content_type: Some(content_type),
            link: None,
        },
    }
}

#[test]
fn ranks_controls_and_architecture_with_inert_provenance() {
    let url = public_url("https://downloads.example.org/app", None).unwrap();
    let result = resolve(
        document(
            &url,
            br#"
        <a href="/MyApp-windows-arm64.zip">Windows</a>
        <a href="app-x64.dmg">Mac Intel</a>
        <a href="app-arm64.dmg#download">Mac <strong>Apple Silicon</strong></a>
        <a href="app-universal.dmg">Universal binary</a>
        <a href="/archive/refs/tags/release.zip">Source code</a>
        <a href="app-arm64.dmg.sig">signature</a>
        <a href="data:text/html,&lt;a&gt;">unsafe</a>
    "#,
            "text/html",
        ),
        None,
    );
    assert_eq!(result.decision, Decision::Resolved);
    assert_eq!(
        result.candidates.iter().map(|c| c.arch).collect::<Vec<_>>(),
        [Arch::Arm64, Arch::Universal, Arch::X86_64]
    );
    assert_eq!(
        result.candidates[0].url.as_str(),
        "https://downloads.example.org/app-arm64.dmg"
    );
    assert!(result.candidates[0].evidence.text.contains("Apple Silicon"));
}

#[test]
fn reads_json_ld_next_nuxt_and_static_url_strings() {
    let url = public_url("https://downloads.example.org/", None).unwrap();
    for (script, suffix) in [
        (
            r#"<script type="application/ld+json">{"operatingSystem":"macOS","downloadUrl":"/tool-arm64.dmg"}</script>"#,
            "/tool-arm64.dmg",
        ),
        (
            r#"<script id="__NEXT_DATA__">{"props":{"mac":{"downloadUrl":"./tool-x86_64.zip"}}}</script>"#,
            "/tool-x86_64.zip",
        ),
        (
            r#"<script id="__NUXT_DATA__">[{"downloadUrl":"/tool-universal.dmg"}]</script>"#,
            "/tool-universal.dmg",
        ),
        (
            r#"<script>window._state = {"mac":{"url":"/tool-arm64.zip"}};</script>"#,
            "/tool-arm64.zip",
        ),
        (
            r#"<button onclick="location.href='/tool-arm64.dmg'">Download</button>"#,
            "/tool-arm64.dmg",
        ),
    ] {
        let result = resolve(document(&url, script.as_bytes(), "text/html"), None);
        assert_eq!(result.candidates[0].url.path(), suffix, "{script}");
    }
}

#[test]
fn reads_only_the_declared_metadata_and_excludes_forge_source_archives() {
    for (forge, api) in [
        (
            "https://github.com/acme/app/releases/latest",
            "https://api.github.com/repos/acme/app/releases/latest",
        ),
        (
            "https://gitlab.com/acme/group/app/-/releases",
            "https://gitlab.com/api/v4/projects/acme%2Fgroup%2Fapp/releases?per_page=1",
        ),
        (
            "https://codeberg.org/acme/app/releases",
            "https://codeberg.org/api/v1/repos/acme/app/releases?limit=1",
        ),
        (
            "https://gitea.com/acme/app",
            "https://gitea.com/api/v1/repos/acme/app/releases/latest",
        ),
    ] {
        let page = public_url(forge, None).unwrap();
        let meta = public_url(api, None).unwrap();
        let html = document(&page, b"<h1>Releases</h1>", "text/html");
        let root = resolve(html, None);
        assert_eq!(root.decision, Decision::NeedsApi, "{forge}");
        assert_eq!(root.candidates[0].url, meta);
        let bytes: &[u8] = if forge.contains("gitlab") {
            br#"{"assets":{"links":[{"direct_asset_url":"https://cdn.example.org/app-macos-arm64.dmg"}],"sources":[{"url":"https://cdn.example.org/source.zip"}]}}"#
        } else {
            br#"{"zipball_url":"https://cdn.example.org/source.zip","assets":[{"browser_download_url":"https://cdn.example.org/app-macos-arm64.dmg"}]}"#
        };
        let result = resolve(html, Some(document(&meta, bytes, "application/json")));
        assert_eq!(result.decision, Decision::Resolved, "{forge}");
        assert_eq!(result.candidates[0].url.path(), "/app-macos-arm64.dmg");
        assert_eq!(
            result
                .candidates
                .iter()
                .filter(|c| c.kind == Kind::DirectFile)
                .count(),
            1
        );
        let unrelated = public_url("https://unrelated.example.org/release.json", None).unwrap();
        let result = resolve(html, Some(document(&unrelated, bytes, "application/json")));
        assert_eq!(result.decision, Decision::NeedsApi);
        assert!(!result.candidates.iter().any(|c| c.kind == Kind::DirectFile));
    }
}

#[test]
fn reads_sparkle_tauri_electron_and_homebrew_payloads() {
    let cases: &[(&str, &str, &[u8], &str)] = &[
        ("https://rectangleapp.com/downloads/updates.xml", "application/xml",
            br#"<rss><channel><item><sparkle:deltas><enclosure url="/delta.dmg"/></sparkle:deltas><enclosure url="/Mac-ARM64.dmg"/></item><item><enclosure url="/old.dmg"/></item></channel></rss>"#, "/Mac-ARM64.dmg"),
        ("https://apps.example.org/latest.json", "application/json",
            br#"{"platforms":{"darwin-aarch64":{"url":"/app-arm64.app.tar.gz"},"windows-x86_64":{"url":"/app.msi"}}}"#, "/app-arm64.app.tar.gz"),
        ("https://apps.example.org/latest-mac.yml", "text/plain",
            b"version: 1.0.0\nfiles:\n  - url: app-universal.dmg\n  - url: app-x64.zip\npath: ignore.dmg\n", "/app-universal.dmg"),
        ("https://formulae.brew.sh/api/cask/zed.json", "application/json",
            br#"{"token":"zed","homepage":"https://zed.dev/","url":"https://dl.example.org/zed-arm64.dmg"}"#, "/zed-arm64.dmg"),
    ];
    for (url, content_type, bytes, expected) in cases {
        let url = public_url(url, None).unwrap();
        let result = resolve(document(&url, bytes, content_type), None);
        assert_eq!(result.decision, Decision::Resolved, "{url}: {result:?}");
        assert_eq!(result.candidates[0].url.path(), *expected);
    }
}

#[test]
fn respects_store_and_consent_and_accepts_public_share_actions() {
    let page = public_url("https://publisher.example.org/", None).unwrap();
    let result = resolve(
        document(
            &page,
            br#"<a href="https://apps.apple.com/us/app/sample/id123">Mac App Store</a>"#,
            "text/html",
        ),
        None,
    );
    assert_eq!(
        (result.decision, result.reason),
        (Decision::Gated, "app_store")
    );
    let gate = public_url("https://developer.android.com/studio", None).unwrap();
    let result = resolve(
        document(
            &gate,
            br#"<a href="/licensed.dmg">Download</a>"#,
            "text/html",
        ),
        None,
    );
    assert_eq!(
        (result.decision, result.reason),
        (Decision::Gated, "vendor_action")
    );
    let result = resolve(document(&page, br#"
        <a href="https://www.dropbox.com/scl/fi/key/tool-mac.zip?rlkey=public&amp;dl=0">Download Mac</a>
        <a href="https://drive.google.com/file/d/identifier/view">Preview</a>
        <a href="https://sourceforge.net/projects/acme/files/Mac.dmg/download">Mac download</a>
        <a href="https://download1500.mediafire.com/public/contents/tool.dmg">Download Mac</a>
    "#, "text/html"), None);
    assert!(
        result
            .candidates
            .iter()
            .any(|c| c.url.as_str().ends_with("tool-mac.zip?rlkey=public&dl=1"))
    );
    assert!(
        result
            .candidates
            .iter()
            .any(|c| c.url.as_str().ends_with("Mac.dmg/download") && c.kind == Kind::Redirect)
    );
    assert!(
        result
            .candidates
            .iter()
            .any(|c| c.url.host_str() == Some("download1500.mediafire.com")
                && c.kind == Kind::DirectFile)
    );
    assert!(
        result
            .candidates
            .iter()
            .any(|c| c.url.host_str() == Some("drive.google.com") && c.kind == Kind::Gated)
    );
}

#[test]
fn rejects_non_public_urls_and_bounds_parser_work() {
    let url = public_url("https://publisher.example.org/", None).unwrap();
    for bad in [
        "https://[::1]/",
        "https://169.254.169.254/",
        "https://127.000.0.1/",
        "https://2130706433/",
        "https://0x7f000001/",
        "https://0177.0.0.1/",
        "https://user@publisher.example.org/",
        "https://@publisher.example.org/",
        "https://public.example.org:80/",
        "https://a.b.local/",
        "https://foo.home.arpa",
        "javascript:void(0)",
        "data:text/html,hello",
        "file:///tmp/app.dmg",
        "ftp://downloads.example.org/app.dmg",
    ] {
        assert!(public_url(bad, Some(&url)).is_none(), "{bad}");
    }
    let too_many_attributes = format!(
        "<a {} href='/app.dmg'>Mac</a>",
        (0..80).map(|i| format!(" x{i}='x'")).collect::<String>()
    );
    for body in [
        "<div>".repeat(120),
        "<a href='/a'>x</a>".repeat(100_000),
        " ".repeat(MAX_DOCUMENT_BYTES + 1),
        too_many_attributes,
    ] {
        let result = resolve(document(&url, body.as_bytes(), "text/html"), None);
        assert_eq!(result.decision, Decision::None);
        assert!(result.page_features.limit_hit);
        assert!(result.candidates.is_empty());
    }
    let result = resolve(document(&url, b"<!DOCTYPE rss [<!ENTITY other SYSTEM 'file:///etc/hosts'>]><rss><channel><item><enclosure url='/unsafe.dmg'/></item></channel></rss>", "application/xml"), None);
    assert!(result.candidates.is_empty());
}

#[test]
fn failure_ledger_carries_hashes_and_structural_evidence() {
    assert_eq!(
        page_resolver::sha256(b""),
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
    let url = public_url("https://publisher.example.org/?session=privacy", None).unwrap();
    let document = document(&url, b"<h1>Downloads</h1>", "text/html");
    let result = resolve(document, None);
    let record = page_resolver::unresolved_record(document, &result, true);
    assert!(
        record["original_url"]
            .as_str()
            .unwrap()
            .starts_with("sha256:")
    );
    assert_eq!(
        record["evidence"]["html_sha256"],
        page_resolver::sha256(document.bytes)
    );
    assert!(!record.to_string().contains("privacy"));
}

#[test]
fn retains_public_trials_and_skips_download_post_forms() {
    let url = public_url("https://publisher.example.org/product", None).unwrap();
    let form = r#"<form method="POST" action="/request-download">
        <input type="email"><a href="/consent-only.dmg">Download for macOS</a>
    </form>"#;
    let gated = resolve(document(&url, form.as_bytes(), "text/html"), None);
    assert_eq!(
        (gated.decision, gated.reason),
        (Decision::Gated, "vendor_action")
    );
    let trial = format!(r#"{form}<a href="/public-trial.dmg">Download for macOS</a>"#);
    let resolved = resolve(document(&url, trial.as_bytes(), "text/html"), None);
    assert_eq!(resolved.decision, Decision::Resolved);
    assert_eq!(resolved.candidates[0].url.path(), "/public-trial.dmg");
    assert_eq!(resolved.candidates.len(), 1);
}

#[test]
fn bounds_single_tag_attributes_and_keeps_equal_ranks_in_source_order() {
    let url = public_url("https://publisher.example.org/releases/mac/", None).unwrap();
    let result = resolve(
        document(
            &url,
            br#"
        <a href="/tool-11.0.zip">Download</a>
        <a href="/tool-9.0.zip">Download</a>
    "#,
            "text/html",
        ),
        None,
    );
    assert_eq!(
        result.candidates.first().unwrap().url.path(),
        "/tool-11.0.zip"
    );
    let html = format!(r#"<a href="{}">Download</a>"#, "x".repeat(100_000));
    let result = resolve(document(&url, html.as_bytes(), "text/html"), None);
    assert_eq!(result.decision, Decision::None);
    assert!(result.candidates.is_empty());
}

#[test]
fn preserves_the_release_base_for_github_electron_files() {
    let url = public_url(
        "https://github.com/acme/app/releases/latest/download/latest-mac.yml",
        None,
    )
    .unwrap();
    let body = b"version: 4.5.6\nfiles:\n  - url: app-arm64.dmg\npath: unused.dmg\n";
    let result = resolve(document(&url, body, "application/yaml"), None);
    assert_eq!(result.decision, Decision::Resolved);
    assert_eq!(
        result.candidates[0].url.as_str(),
        "https://github.com/acme/app/releases/download/v4.5.6/app-arm64.dmg"
    );
}

#[test]
fn finds_only_a_github_projects_declared_fragment() {
    let url = public_url("https://github.com/acme/app/releases/tag/v1.2.3", None).unwrap();
    let result = resolve(
        document(
            &url,
            br#"
        <include-fragment src="/acme/app/releases/expanded_assets/v1.2.3"></include-fragment>
        <include-fragment src="/another/repo/releases/expanded_assets/v9"></include-fragment>
    "#,
            "text/html",
        ),
        None,
    );
    assert_eq!(result.decision, Decision::NeedsApi);
    assert!(
        result
            .candidates
            .iter()
            .any(|c| c.evidence.selector == "include-fragment[src]")
    );
    assert!(
        !result
            .candidates
            .iter()
            .any(|c| c.url.path().contains("/another/"))
    );
}

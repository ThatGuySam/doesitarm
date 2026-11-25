use crate::{Context, Evidence, Hint, Kind, adapters, short};
use html5gum::{
    Span, Tokenizer,
    emitters::callback::{CallbackEmitter, CallbackEvent},
};
use regex::Regex;
use std::{collections::BTreeMap, mem, str, sync::LazyLock};

const MAX_TOKENS: usize = 50_000;
const MAX_DEPTH: usize = 96;
const MAX_ATTRIBUTES: usize = 64;
const MAX_ATTRIBUTE_BYTES: usize = 8192;
const MAX_SCRIPT_BYTES: usize = 512 * 1024;

static LITERAL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"["']((?:https://|//|/|\.\.?/)[^"'\s<>{}\\]{1,4000})["']"#).unwrap()
});

static STATE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i-u:window|globalThis)\s*\.\s*[a-zA-Z_][a-zA-Z_0-9]*\s*=\s*([\[{])").unwrap()
});

#[derive(Default)]
struct StartTag {
    name: String,
    attributes: BTreeMap<String, Vec<u8>>,
    self_closing: bool,
}

enum Token {
    Start(StartTag),
    End(String),
    Text(Vec<u8>),
    Other,
    Limit,
}

/// Bound storage while a start tag is still being read. Counting after the
/// complete token would let a single tag allocate an unbounded attribute map.
fn tokenizer(bytes: &[u8]) -> impl Iterator<Item = Token> + use<'_> {
    let mut tag = StartTag::default();
    let mut attribute = None;
    let mut attributes = 0;
    let mut emitter = CallbackEmitter::new(move |event: CallbackEvent<'_>, _: Span<()>| {
        match event {
            CallbackEvent::OpenStartTag { name } => {
                if name.len() > 128 {
                    return Some(Token::Limit);
                }
                tag.name = String::from_utf8_lossy(name).into_owned();
                attributes = 0;
                attribute = None;
                None
            }
            CallbackEvent::AttributeName { name } => {
                attributes += 1;
                if attributes > MAX_ATTRIBUTES {
                    return Some(Token::Limit);
                }
                attribute = str::from_utf8(name)
                    .ok()
                    .filter(|name| name.len() <= 128 && !tag.attributes.contains_key(*name))
                    .map(str::to_owned);
                if let Some(name) = &attribute {
                    tag.attributes.insert(name.clone(), Vec::new());
                }
                None
            }
            CallbackEvent::AttributeValue { value } => {
                if let Some(name) = &attribute {
                    let stored = tag
                        .attributes
                        .get_mut(name)
                        .expect("the name was just inserted");
                    if value.len() <= MAX_ATTRIBUTE_BYTES - stored.len() {
                        stored.extend_from_slice(value);
                    } else {
                        // The attribute is unavailable to extraction, including any prefix.
                        stored.clear();
                        attribute = None;
                    }
                }
                None
            }
            CallbackEvent::CloseStartTag { self_closing } => {
                tag.self_closing = self_closing;
                Some(Token::Start(mem::take(&mut tag)))
            }
            CallbackEvent::EndTag { name } => {
                tag = StartTag::default();
                Some(Token::End(String::from_utf8_lossy(name).into_owned()))
            }
            CallbackEvent::String { value } => Some(Token::Text(value.to_owned())),
            _ => Some(Token::Other),
        }
    });
    emitter.naively_switch_states(true);
    Tokenizer::new_with_emitter(bytes, emitter)
        .map(|token| token.expect("slice reads are infallible"))
}

struct Frame {
    name: String,
    skip: bool,
    heading: bool,
    script: bool,
    script_kind: String,
    text: String,
    hints: Vec<Hint>,
    post_form: bool,
    form_signals: String,
    heading_context: String,
}

impl Frame {
    fn new(name: &str, skip: bool) -> Self {
        Self {
            name: name.to_owned(),
            skip,
            heading: matches!(name, "h1" | "h2" | "h3" | "h4" | "title"),
            script: name == "script",
            script_kind: String::new(),
            text: String::new(),
            hints: Vec::new(),
            post_form: false,
            form_signals: String::new(),
            heading_context: String::new(),
        }
    }
}

pub fn parse(context: &mut Context<'_>, bytes: &[u8], adapters_enabled: bool) {
    let mut frames: Vec<Frame> = Vec::new();
    let mut heading = String::new();
    for token in tokenizer(bytes) {
        context.features.tokens += 1;
        if context.features.tokens > MAX_TOKENS || matches!(token, Token::Limit) {
            context.features.limit_hit = true;
            return;
        }
        match token {
            Token::Start(tag) => {
                if frames.len() >= MAX_DEPTH {
                    context.features.limit_hit = true;
                    return;
                }
                let name = tag.name.as_str();
                if matches!(name, "a" | "button" | "li" | "tr" | "td" | "option" | "p")
                    && frames.last().is_some_and(|f| f.name == name)
                {
                    finish_frame(
                        context,
                        frames.pop().unwrap(),
                        &mut heading,
                        adapters_enabled,
                    );
                }
                let get = |key: &str| attr(&tag, key);
                let mut frame = Frame::new(
                    name,
                    frames.last().is_some_and(|f| f.skip)
                        || matches!(name, "template" | "dialog" | "style" | "textarea" | "svg")
                        || get("role") == Some("dialog"),
                );
                if !frame.skip {
                    if let Some(post) = frames.iter_mut().rev().find(|f| f.post_form) {
                        if post.form_signals.len() < 512 {
                            if let Some(signal) = get("type").or_else(|| get("name")) {
                                post.form_signals.push_str(&short(signal, 64));
                                post.form_signals.push(' ');
                            }
                        }
                        frame.skip = true;
                    } else if name == "form"
                        && get("method").is_some_and(|m| m.eq_ignore_ascii_case("post"))
                    {
                        frame.post_form = true;
                        frame.form_signals =
                            [get("id"), get("name"), get("action"), get("aria-label")]
                                .into_iter()
                                .flatten()
                                .map(|value| short(value, 100))
                                .collect::<Vec<_>>()
                                .join(" ");
                    }
                }
                if !frame.skip && !frame.post_form {
                    if frame.script {
                        context.features.script_blocks += 1;
                        frame.script_kind =
                            short(get("id").or_else(|| get("type")).unwrap_or("script"), 80);
                        if adapters_enabled {
                            if let Some(src) = get("src") {
                                adapters::declared_script(context, src);
                            }
                        }
                    }
                    process_tag(
                        context,
                        &tag,
                        &mut frame,
                        &mut frames,
                        &heading,
                        adapters_enabled,
                    );
                }
                if void_element(name)
                    || (tag.self_closing
                        && matches!(name, "enclosure" | "path" | "circle" | "use" | "rect"))
                {
                    finish_frame(context, frame, &mut heading, adapters_enabled);
                } else {
                    frames.push(frame);
                }
            }
            Token::End(name) => {
                if let Some(index) = frames.iter().rposition(|frame| frame.name == name) {
                    while frames.len() > index {
                        finish_frame(
                            context,
                            frames.pop().unwrap(),
                            &mut heading,
                            adapters_enabled,
                        );
                    }
                }
            }
            Token::Text(content) => {
                let text = String::from_utf8_lossy(&content);
                if let Some(form) = frames.iter_mut().rev().find(|frame| frame.post_form) {
                    if form.form_signals.len() < 512 {
                        form.form_signals.push_str(&short(text.trim(), 100));
                        form.form_signals.push(' ');
                    }
                    continue;
                }
                if frames.last().is_some_and(|f| f.skip) {
                    continue;
                }
                let script = frames.last_mut().filter(|f| f.script);
                if let Some(script) = script {
                    if script.text.len() + text.len() <= MAX_SCRIPT_BYTES {
                        script.text.push_str(&text);
                    } else {
                        // This individual opaque block is too large to be useful.
                        script.text.clear();
                        script.skip = true;
                    }
                } else if let Some(frame) = frames
                    .iter_mut()
                    .rev()
                    .find(|f| f.heading || !f.hints.is_empty())
                {
                    if frame.text.len() < 400 {
                        frame.text.push_str(&short(text.trim(), 180));
                        frame.text.push(' ');
                    }
                }
            }
            _ => {}
        }
    }
    while let Some(frame) = frames.pop() {
        finish_frame(context, frame, &mut heading, adapters_enabled);
    }
}

fn void_element(name: &str) -> bool {
    matches!(
        name,
        "area"
            | "base"
            | "br"
            | "col"
            | "embed"
            | "hr"
            | "img"
            | "input"
            | "link"
            | "meta"
            | "param"
            | "source"
            | "track"
            | "wbr"
    )
}

fn attr<'a>(tag: &'a StartTag, key: &str) -> Option<&'a str> {
    str::from_utf8(tag.attributes.get(key)?).ok()
}

fn process_tag(
    context: &mut Context<'_>,
    tag: &StartTag,
    frame: &mut Frame,
    parents: &mut [Frame],
    heading: &str,
    adapters_enabled: bool,
) {
    let get = |key| attr(tag, key);
    let name = frame.name.as_str();
    if name == "meta"
        && get("http-equiv").is_some_and(|value| value.eq_ignore_ascii_case("refresh"))
    {
        if let Some(target) = get("content").and_then(refresh) {
            context.add(
                target,
                "html",
                "meta[http-equiv=refresh]",
                "Immediate download redirect",
                Some(Kind::Redirect),
                false,
            );
        }
    } else if name == "link" {
        if let Some(href) = get("href") {
            let rel = get("rel").unwrap_or_default();
            if rel
                .split_ascii_whitespace()
                .any(|r| r.eq_ignore_ascii_case("download"))
            {
                context.add(
                    href,
                    "html",
                    "link[rel=download]",
                    get("title").unwrap_or("Download"),
                    None,
                    false,
                );
            } else if rel
                .split_ascii_whitespace()
                .any(|r| r.eq_ignore_ascii_case("alternate"))
            {
                let media_type = get("type").unwrap_or("");
                if adapters_enabled {
                    adapters::feed_hint(context, href, "link[rel=alternate]", media_type);
                }
                if [
                    "application/x-apple-diskimage",
                    "application/x-newton-compatible-pkg",
                    "application/zip",
                ]
                .iter()
                .any(|mime| media_type.eq_ignore_ascii_case(mime))
                {
                    let mac = media_type != "application/zip";
                    context.add(
                        href,
                        "html",
                        "link[rel=alternate]",
                        get("title").unwrap_or("Download"),
                        Some(Kind::Redirect),
                        mac,
                    );
                }
            }
        }
    } else if name == "iframe" {
        if let Some(src) = get("src") {
            context.add(
                src,
                "html",
                "iframe[src]",
                get("title").unwrap_or("Download frame"),
                None,
                false,
            );
        }
    } else if name == "include-fragment" && adapters_enabled {
        if let Some(src) = get("src") {
            adapters::forge_fragment(context, src);
        }
    } else if name == "img" {
        if let Some(parent) = parents.iter_mut().rev().find(|p| !p.hints.is_empty()) {
            if let Some(alt) = get("alt").filter(|_| parent.text.len() < 400) {
                parent.text.push_str(&short(alt, 120));
                parent.text.push(' ');
            }
        }
    } else {
        let control =
            matches!(name, "a" | "button" | "input" | "option") || get("role") == Some("button");
        for (key, value) in &tag.attributes {
            let key = key.as_str();
            let Ok(value) = str::from_utf8(value) else {
                continue;
            };
            if value.len() > MAX_ATTRIBUTE_BYTES {
                continue;
            }
            let data_url = key.starts_with("data-")
                && (key.contains("download")
                    || key.contains("url")
                    || key.contains("href")
                    || key.ends_with("-link")
                    || key.ends_with("-file"));
            if data_url && value.trim_start().starts_with(['{', '[']) {
                adapters::inline_json(context, value.as_bytes(), &format!("{name}[{key}]"));
                continue;
            }
            if (control && matches!(key, "href" | "formaction") || data_url)
                && url_value(value)
                && key != "formaction"
            {
                if adapters_enabled {
                    adapters::feed_hint(context, value, &format!("{name}[{key}]"), "");
                }
                let selector = if get("download").is_some() {
                    format!("{name}[{key}][download]")
                } else {
                    format!("{name}[{key}]")
                };
                let label = [
                    get("aria-label"),
                    get("title"),
                    get("download"),
                    get("data-platform"),
                    get("data-os"),
                    get("data-arch"),
                    Some(key),
                ]
                .into_iter()
                .flatten()
                .collect::<Vec<_>>()
                .join(" ");
                frame.hints.push(Hint {
                    raw: value.to_owned(),
                    kind: None,
                    mac_context: false,
                    evidence: Evidence {
                        source: "html",
                        selector,
                        text: short(&label, 140),
                    },
                });
            } else if control && key == "onclick" && value.contains("location") {
                script_literals(context, value, "onclick", adapters_enabled);
            }
        }
        if !frame.hints.is_empty() && useful_heading(heading) {
            frame.heading_context.push_str(heading);
        }
    }
}

fn useful_heading(heading: &str) -> bool {
    let normalized = heading.to_ascii_lowercase();
    (normalized.contains("macos")
        || normalized.contains("mac os")
        || normalized.contains("for mac")
        || normalized.trim() == "mac")
        && !normalized.contains("windows")
        && !normalized.contains("linux")
}

fn url_value(value: &str) -> bool {
    let value = value.trim();
    !value.is_empty()
        && !value.starts_with('#')
        && value.len() <= 4096
        && !matches!(value, "true" | "false" | "null" | "undefined")
}

fn refresh(value: &str) -> Option<&str> {
    let (delay, target) = value.split_once(';')?;
    let delay = delay.trim().parse::<f32>().ok()?;
    if !(0.0..=1.0).contains(&delay) {
        return None;
    }
    let (name, url) = target.trim().split_once('=')?;
    name.trim()
        .eq_ignore_ascii_case("url")
        .then(|| url.trim().trim_matches(['\'', '"']))
}

fn finish_frame(
    context: &mut Context<'_>,
    mut frame: Frame,
    heading: &mut String,
    adapters_enabled: bool,
) {
    if frame.skip {
        return;
    }
    if frame.post_form {
        let evidence = frame.form_signals.to_ascii_lowercase();
        if evidence.contains("download")
            || evidence.contains("license agreement")
            || evidence.contains("license key")
        {
            context.features.download_forms += 1;
        }
    }
    if frame.heading {
        let text = frame.text.trim();
        if matches!(frame.name.as_str(), "title" | "h1") {
            let title = text.to_ascii_lowercase();
            if [
                "client challenge",
                "access denied",
                "just a moment",
                "attention required",
                "request blocked",
            ]
            .iter()
            .any(|phrase| title.contains(phrase))
            {
                context.gate = Some("access_restricted");
            }
        }
        *heading = short(text, 110);
    }
    if frame.script && !frame.text.is_empty() {
        let script = frame.text.trim();
        if matches!(
            frame.script_kind.as_str(),
            "application/ld+json" | "application/json" | "__NEXT_DATA__" | "__NUXT_DATA__"
        ) || script.starts_with('{')
            || script.starts_with('[')
        {
            adapters::inline_json(context, script.as_bytes(), &frame.script_kind);
        } else if let Some(state) = STATE.captures(script).and_then(|m| m.get(1)) {
            // Read one JSON value after a recognized assignment. Trailing JS is ignored.
            let bytes = &script.as_bytes()[state.start()..];
            if let Some(Ok(value)) = serde_json::Deserializer::from_slice(bytes)
                .into_iter::<serde_json::Value>()
                .next()
            {
                adapters::inline_value(context, &value, "window state");
            }
        }
        script_literals(context, script, &frame.script_kind, adapters_enabled);
    }
    for mut hint in frame.hints.drain(..) {
        let label = format!("{} {}", frame.text.trim(), hint.evidence.text.trim());
        let local = label.to_ascii_lowercase();
        let mac_page = context.base.path_segments().is_some_and(|parts| {
            parts
                .filter(|part| !part.is_empty())
                .rev()
                .take(2)
                .any(|part| matches!(part, "mac" | "macos" | "osx"))
        });
        if (!frame.heading_context.is_empty() || mac_page)
            && !["windows", "linux", "android", "ios", "iphone", "ipad"]
                .iter()
                .any(|os| local.contains(os))
        {
            hint.mac_context = true;
        }
        hint.evidence.text = short(&label, 160);
        if adapters_enabled && frame.name == "a" {
            adapters::forge_link(context, &hint.raw, &hint.evidence.text);
        }
        context.hint(hint);
    }
}

pub(crate) fn script_literals(
    context: &mut Context<'_>,
    script: &str,
    selector: &str,
    adapters_enabled: bool,
) {
    if script.len() > MAX_SCRIPT_BYTES {
        return;
    }
    let unescaped;
    let script = if script.contains("\\/") || script.contains("\\u002F") {
        unescaped = script.replace("\\/", "/").replace("\\u002F", "/");
        unescaped.as_str()
    } else {
        script
    };
    for capture in LITERAL.captures_iter(script).take(1024) {
        let value = &capture[1];
        if adapters_enabled {
            adapters::feed_hint(context, value, selector, "");
        }
        context.add(value, "script", selector, "", None, false);
    }
}

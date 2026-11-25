use crate::{Context, Evidence, Hint, Kind, adapters, short};
use html5gum::{DefaultEmitter, StartTag, Token, Tokenizer};
use regex::Regex;
use std::{str, sync::LazyLock};

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

struct Frame {
    name: String,
    skip: bool,
    heading: bool,
    script: bool,
    script_kind: String,
    text: String,
    hints: Vec<Hint>,
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
        }
    }
}

pub fn parse(context: &mut Context<'_>, bytes: &[u8], adapters_enabled: bool) {
    let mut emitter = DefaultEmitter::default();
    emitter.naively_switch_states(true);
    let tokens = Tokenizer::new_with_emitter(bytes, emitter)
        .map(|token| token.expect("slice reads are infallible"));
    let mut frames: Vec<Frame> = Vec::new();
    let mut heading = String::new();
    for token in tokens {
        context.features.tokens += 1;
        if context.features.tokens > MAX_TOKENS {
            context.features.limit_hit = true;
            return;
        }
        match token {
            Token::StartTag(tag) => {
                if tag.attributes.len() > MAX_ATTRIBUTES || frames.len() >= MAX_DEPTH {
                    context.features.limit_hit = true;
                    return;
                }
                let Ok(name) = str::from_utf8(&tag.name) else {
                    continue;
                };
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
            Token::EndTag(tag) => {
                if let Ok(name) = str::from_utf8(&tag.name) {
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
            }
            Token::String(content) => {
                if frames.last().is_some_and(|f| f.skip) {
                    continue;
                }
                let text = String::from_utf8_lossy(&content);
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

fn attr<'a>(tag: &'a StartTag<()>, key: &str) -> Option<&'a str> {
    let value = tag.attributes.get(key.as_bytes())?;
    (value.len() <= MAX_ATTRIBUTE_BYTES)
        .then(|| str::from_utf8(value).ok())
        .flatten()
}

fn process_tag(
    context: &mut Context<'_>,
    tag: &StartTag<()>,
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
            } else if adapters_enabled
                && rel
                    .split_ascii_whitespace()
                    .any(|r| r.eq_ignore_ascii_case("alternate"))
            {
                adapters::feed_hint(
                    context,
                    href,
                    "link[rel=alternate]",
                    get("type").unwrap_or(""),
                );
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
            let Ok(key) = str::from_utf8(key) else {
                continue;
            };
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
            frame.text.push_str(heading);
            frame.text.push(' ');
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
        hint.evidence.text = short(
            &format!("{} {}", frame.text.trim(), hint.evidence.text.trim()),
            160,
        );
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

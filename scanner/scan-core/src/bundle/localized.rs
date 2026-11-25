use crate::{ScanError, plist_value};
use std::borrow::Cow;

use super::string;

pub(crate) const MAX_STRINGS: u64 = 64 * 1024;
const INVALID: ScanError = ScanError::Invalid("bundle InfoPlist.strings");

pub(crate) fn development_path(plist: &[u8]) -> Option<String> {
    let plist = plist.strip_prefix(b"\xef\xbb\xbf").unwrap_or(plist);
    let value = plist_value::parse(plist, INVALID).ok()?;
    let region = string(value.as_dictionary()?, "CFBundleDevelopmentRegion")?;
    (region.len() <= 64
        && region
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_')))
    .then(|| format!("Resources/{region}.lproj/InfoPlist.strings"))
}

pub(crate) fn name(bytes: &[u8]) -> Option<String> {
    let read_plist = |bytes| {
        let value = plist_value::parse(bytes, INVALID).ok()?;
        let dictionary = value.as_dictionary()?;
        string(dictionary, "CFBundleDisplayName")
            .or_else(|| string(dictionary, "CFBundleName"))
            .map(str::to_owned)
    };
    if bytes.starts_with(b"bplist00") {
        return read_plist(bytes);
    }

    let text = match bytes {
        [a, b, body @ ..] if matches!((*a, *b), (0xfe, 0xff) | (0xff, 0xfe)) => {
            let (pairs, remainder) = body.as_chunks::<2>();
            if !remainder.is_empty() {
                return None;
            }
            let units = pairs.iter().map(|&pair| {
                if *a == 0xfe {
                    u16::from_be_bytes(pair)
                } else {
                    u16::from_le_bytes(pair)
                }
            });
            Cow::Owned(
                char::decode_utf16(units)
                    .collect::<Result<String, _>>()
                    .ok()?,
            )
        }
        _ => {
            let text = std::str::from_utf8(bytes).ok()?;
            Cow::Borrowed(text.trim_start_matches('\u{feff}'))
        }
    };
    if text.trim_start().starts_with('<') {
        return read_plist(text.as_bytes());
    }
    let mut input = text.as_ref();
    let mut display = None;
    let mut bundle = None;
    while !trivia(&mut input)?.is_empty() {
        let key = token(&mut input)?;
        input = trivia(&mut input)?.strip_prefix('=')?;
        let value = token(&mut input)?;
        input = trivia(&mut input)?.strip_prefix(';')?;
        let slot = match key.as_str() {
            "CFBundleDisplayName" => &mut display,
            "CFBundleName" => &mut bundle,
            _ => continue,
        };
        if !value.trim().is_empty() && slot.replace(value).is_some() {
            return None;
        }
    }
    display.or(bundle)
}

fn trivia<'a>(input: &mut &'a str) -> Option<&'a str> {
    loop {
        *input = input.trim_start();
        if let Some(comment) = input.strip_prefix("/*") {
            *input = comment.split_once("*/")?.1;
        } else if let Some(comment) = input.strip_prefix("//") {
            *input = comment.split_once('\n').map_or("", |(_, tail)| tail);
        } else {
            return Some(input);
        }
    }
}

fn token(input: &mut &str) -> Option<String> {
    let text = trivia(input)?;
    let Some(quoted) = text.strip_prefix('"') else {
        let end = text
            .bytes()
            .take_while(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b'.'))
            .count();
        *input = &text[end..];
        return (end > 0).then(|| text[..end].to_owned());
    };
    let mut chars = quoted.chars();
    let mut output = String::new();
    loop {
        let next = match chars.next()? {
            '"' => {
                *input = chars.as_str();
                return Some(output);
            }
            '\\' => match chars.next()? {
                value @ ('"' | '\\' | '/') => value,
                'n' => '\n',
                'r' => '\r',
                't' => '\t',
                'U' | 'u' => {
                    let point = (0..4)
                        .try_fold(0, |value, _| Some(value * 16 + chars.next()?.to_digit(16)?))?;
                    char::from_u32(point)?
                }
                _ => return None,
            },
            value => value,
        };
        if next == '\0' {
            return None;
        }
        output.push(next);
    }
}

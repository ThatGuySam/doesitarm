use regex::{Captures, Regex};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::sync::LazyLock;

pub(super) fn sha(bytes: impl AsRef<[u8]>) -> String {
    hex(&Sha256::digest(bytes))
}

static HOMES: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)([/\\]|%2f|%5c)(Users|home)([/\\]|%2f|%5c)(?:%3cuser%3e|<user>|[^/\\\s"'?#&:<>\[\](){},;]+)"#).unwrap()
});
static ENCODED_SEP: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)%2f|%5c").unwrap());
static URL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(?i)https?://[^\s"'<>\[\]{}]+"#).unwrap());
static CREDENTIALS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)^(https?://)([^/@?#]+)@").unwrap());
static QUERY: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"([?&#](?:amp;)?)([^=&#?\s"'<>]+)=([^&#\s"'<>]*)"#).unwrap());

fn decoded_key(key: &str) -> String {
    let mut chars = key.bytes();
    let mut decoded = Vec::new();
    while let Some(byte) = chars.next() {
        decoded.push(if byte == b'%' {
            chars
                .next()
                .zip(chars.next())
                .and_then(|(a, b)| Some((a as char).to_digit(16)? * 16 + (b as char).to_digit(16)?))
                .map_or(byte, |v| v as u8)
        } else {
            byte
        });
    }
    String::from_utf8_lossy(&decoded).to_ascii_lowercase()
}

fn query(text: &str) -> String {
    QUERY
        .replace_all(text, |cap: &Captures<'_>| {
            let key = decoded_key(&cap[2]);
            let secret = matches!(
                key.as_str(),
                "signature"
                    | "token"
                    | "key"
                    | "sig"
                    | "auth"
                    | "access_token"
                    | "api_key"
                    | "apikey"
                    | "authorization"
                    | "session"
                    | "session_token"
                    | "credential"
                    | "jwt"
                    | "password"
                    | "secret"
                    | "googleaccessid"
                    | "policy"
                    | "key-pair-id"
            ) || key.starts_with("x-amz-")
                || key.starts_with("x-goog-")
                || key.ends_with("_token")
                || key.ends_with("-token");
            let value = &cap[3];
            if secret
                && !(value.len() == 71
                    && value.starts_with("sha256-")
                    && value[7..].bytes().all(|b| b.is_ascii_hexdigit()))
            {
                format!("{}{}=sha256-{}", &cap[1], &cap[2], sha(value))
            } else {
                cap[0].to_owned()
            }
        })
        .into_owned()
}

pub(super) fn text(input: &str) -> String {
    let urls = URL.replace_all(input, |cap: &Captures<'_>| {
        CREDENTIALS
            .replace(&cap[0], |cred: &Captures<'_>| {
                if cred[2].starts_with("sha256-") && cred[2].len() == 71 {
                    cred[0].to_owned()
                } else {
                    format!("{}sha256-{}@", &cred[1], sha(&cred[2]))
                }
            })
            .into_owned()
    });
    let queries = query(&urls);
    HOMES
        .replace_all(&queries, |cap: &Captures<'_>| {
            let sep = &cap[3];
            if !sep.eq_ignore_ascii_case("%5c")
                && sep != "\\"
                && !matches!(&cap[2], "Users" | "home")
            {
                return cap[0].to_owned();
            }
            let full = &cap[0][cap[1].len() + cap[2].len() + sep.len()..];
            let remainder = ENCODED_SEP.find(full).map_or("", |m| &full[m.start()..]);
            let placeholder = if sep.starts_with('%') {
                "%3Cuser%3E"
            } else {
                "<user>"
            };
            format!("{}{}{}{}{}", &cap[1], &cap[2], sep, placeholder, remainder)
        })
        .into_owned()
}

pub(super) fn value(input: &mut Value) {
    match input {
        Value::String(s) => *s = text(s),
        Value::Array(items) => items.iter_mut().for_each(value),
        Value::Object(fields) => {
            *fields = std::mem::take(fields)
                .into_iter()
                .map(|(key, mut field)| {
                    if (key.ends_with("_hex") || key == "magic")
                        && let Some(bytes) = field.as_str().and_then(unhex)
                        && !safe_binary(&bytes)
                    {
                        field = Value::Null;
                    } else {
                        value(&mut field);
                    }
                    (text(&key), field)
                })
                .collect();
        }
        _ => {}
    }
}

pub(super) fn hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        write!(out, "{b:02x}").unwrap();
    }
    out
}

pub(super) fn unhex(s: &str) -> Option<Vec<u8>> {
    if !s.len().is_multiple_of(2) || !s.is_ascii() {
        return None;
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok())
        .collect()
}

pub(super) fn safe_binary(bytes: &[u8]) -> bool {
    // Exact replay data cannot be rewritten. Reject detected account paths and
    // credential-bearing URLs, including common UTF-16 encodings.
    let contains_private = |data: &[u8]| {
        let decoded = String::from_utf8_lossy(data);
        text(&decoded) != decoded
    };
    if contains_private(bytes) {
        return false;
    }
    for offset in 0..2 {
        if let Some(bytes) = bytes.get(offset..) {
            for little in [false, true] {
                let ascii: Vec<_> = bytes
                    .as_chunks::<2>()
                    .0
                    .iter()
                    .map(|pair| {
                        let (low, high) = if little {
                            (pair[0], pair[1])
                        } else {
                            (pair[1], pair[0])
                        };
                        if high == 0 { low } else { b' ' }
                    })
                    .collect();
                if contains_private(&ascii) {
                    return false;
                }
            }
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn scrubs_nested_paths_urls_and_credentials() {
        let mut row = json!({
            "/Users/alice/key": ["/home/alice/Code", "C:\\Users\\Alice\\Code",
                "https://host/%2FUsers%2FAlice%2FCode?arch=arm64&%74oken=T0K&X-AMZ-Credential=SIGN",
                "source: https://user:pass@host/file?SIG=X&Auth=Y&key=Z",
                "https://host/file?signature=secret#public"
            ]
        });
        value(&mut row);
        let serialized = row.to_string();
        for sensitive in [
            "alice",
            "Alice",
            "T0K",
            "SIGN",
            "user:pass",
            "SIG=X",
            "Auth=Y",
            "key=Z",
            "signature=secret",
        ] {
            assert!(
                !serialized.contains(sensitive),
                "{sensitive} leaked: {serialized}"
            );
        }
        assert!(serialized.contains("arch=arm64"));
        assert!(serialized.contains("%2FCode"));
        assert!(row.get("/Users/<user>/key").is_some());
        let once = row.clone();
        value(&mut row);
        assert_eq!(row, once);
    }

    #[test]
    fn rejects_private_range_bytes_in_utf16_and_plaintext() {
        assert!(!safe_binary(b"\x00/home/sam/private\x00"));
        let utf16: Vec<_> = "/Users/sam/private"
            .encode_utf16()
            .flat_map(u16::to_le_bytes)
            .collect();
        assert!(!safe_binary(&utf16));
        assert!(safe_binary(b"/Applications/App.app"));
    }
}

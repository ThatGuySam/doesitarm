#[derive(Default)]
pub struct Robots {
    rules: Vec<Rule>,
}

struct Rule {
    allow: bool,
    pattern: Vec<u8>,
}

#[derive(Default)]
struct Group {
    agents: Vec<String>,
    rules: Vec<Rule>,
    has_directives: bool,
}

impl Robots {
    pub fn parse(bytes: &[u8]) -> Self {
        let text = String::from_utf8_lossy(bytes);
        let mut groups = vec![Group::default()];
        for line in text.trim_start_matches('\u{feff}').lines() {
            let line = line.split('#').next().unwrap_or_default();
            let Some((key, value)) = line.split_once(':') else {
                continue;
            };
            let key = key.trim().to_ascii_lowercase();
            let value = value.trim();
            if key == "user-agent" {
                if groups.last().unwrap().has_directives {
                    groups.push(Group::default());
                }
                groups
                    .last_mut()
                    .unwrap()
                    .agents
                    .push(value.to_ascii_lowercase());
            } else if matches!(key.as_str(), "allow" | "disallow") {
                let group = groups.last_mut().unwrap();
                if !group.agents.is_empty() {
                    group.has_directives = true;
                    if value.starts_with('/') {
                        group.rules.push(Rule {
                            allow: key == "allow",
                            pattern: normalize(value),
                        });
                    }
                }
            }
        }
        let mut selected = Self::default();
        let mut specificity = None;
        let agent = "doesitarm-sourcetools";
        for group in groups {
            let best = group
                .agents
                .iter()
                .filter_map(|entry| {
                    if entry == "*" {
                        Some(0)
                    } else if !entry.is_empty() && agent.starts_with(entry) {
                        Some(entry.len())
                    } else {
                        None
                    }
                })
                .max();
            if let Some(best) =
                best.filter(|best| specificity.is_none_or(|current| *best >= current))
            {
                if specificity != Some(best) {
                    selected.rules.clear();
                    specificity = Some(best);
                }
                selected.rules.extend(group.rules);
            }
        }
        selected
    }

    pub fn allows(&self, path: &str) -> bool {
        let path = normalize(path);
        self.rules
            .iter()
            .filter(|rule| matches(&rule.pattern, &path))
            .max_by_key(|rule| {
                (
                    rule.pattern
                        .iter()
                        .filter(|b| !matches!(b, b'*' | b'$'))
                        .count(),
                    rule.allow,
                )
            })
            .is_none_or(|rule| rule.allow)
    }
}

fn normalize(input: &str) -> Vec<u8> {
    let mut bytes = input.as_bytes().iter().copied().peekable();
    let mut normalized = Vec::new();
    while let Some(byte) = bytes.next() {
        if byte == b'%' {
            let mut lookahead = bytes.clone();
            if let (Some(first), Some(second)) = (lookahead.next(), lookahead.next())
                && let (Some(hi), Some(lo)) =
                    ((first as char).to_digit(16), (second as char).to_digit(16))
            {
                let decoded = (16 * hi + lo) as u8;
                if decoded.is_ascii_alphanumeric() || b"-._~".contains(&decoded) {
                    normalized.push(decoded);
                } else {
                    normalized.extend_from_slice(&[
                        byte,
                        first.to_ascii_uppercase(),
                        second.to_ascii_uppercase(),
                    ]);
                }
                bytes = lookahead;
                continue;
            }
        }
        if byte.is_ascii() {
            normalized.push(byte);
        } else {
            normalized.extend_from_slice(format!("%{byte:02X}").as_bytes());
        }
    }
    normalized
}

fn matches(pattern: &[u8], text: &[u8]) -> bool {
    let (pattern, anchored) = pattern
        .strip_suffix(b"$")
        .map_or((pattern, false), |p| (p, true));
    let (mut p, mut t, mut wildcard) = (0, 0, None);
    while t < text.len() {
        match pattern.get(p) {
            None if !anchored => return true,
            Some(b'*') => {
                p += 1;
                wildcard = Some((p, t));
            }
            Some(b) if *b == text[t] => {
                p += 1;
                t += 1;
            }
            _ => match wildcard {
                Some((after, previous)) if previous < text.len() => {
                    t = previous + 1;
                    p = after;
                    wildcard = Some((after, t));
                }
                _ => return false,
            },
        }
    }
    pattern[p..].iter().all(|byte| *byte == b'*')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn applies_specific_groups_and_path_rules() {
        let robots = Robots::parse(b"User-Agent: *\nDisallow: /\n\nUser-Agent: DoesItARM-SourceTools\nDisallow: /binaries/*small.zip$\nAllow: /binaries/allowed-small.zip$\n\nUser-Agent: DoesItARM-SourceTools\nDisallow: /my%2Fthing\n");
        assert!(robots.allows("/"));
        assert!(robots.allows("/binaries/allowed-small.zip"));
        assert!(robots.allows("/binaries/small.zip?arch=mac"));
        assert!(!robots.allows("/binaries/foo/big-small.zip"));
        assert!(!robots.allows("/binaries/sm%61ll.zip"));
        assert!(!robots.allows("/my%2fthing"));
        assert!(robots.allows("/my/thing"));
        assert!(!Robots::parse(b"User-agent: *\nDisallow: /").allows("/"));
    }
}

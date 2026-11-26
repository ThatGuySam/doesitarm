// Static scalars only. Callers treat templates and YAML metasyntax as unresolved.
pub fn field(line: &str) -> Option<(&str, String)> {
    let (key, value) = line.split_once(':')?;
    let key = key.trim();
    if key.is_empty()
        || !key
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_".contains(&b))
    {
        return None;
    }
    let value = value.trim();
    let value = if let Some(quoted) = value.strip_prefix('\'') {
        let mut chars = quoted.char_indices().peekable();
        let mut decoded = String::new();
        let mut closed = false;
        while let Some((i, ch)) = chars.next() {
            if ch == '\'' {
                if chars.next_if(|(_, c)| *c == '\'').is_some() {
                    decoded.push('\'');
                } else {
                    closed = suffix(&quoted[i + 1..]);
                    break;
                }
            } else {
                decoded.push(ch);
            }
        }
        closed.then_some(decoded)?
    } else if let Some(quoted) = value.strip_prefix('"') {
        let mut escaped = false;
        let mut closing = None;
        for (i, ch) in quoted.char_indices() {
            if ch == '"' && !escaped {
                closing = Some(i);
                break;
            }
            escaped = ch == '\\' && !escaped;
        }
        let i = closing?;
        if !suffix(&quoted[i + 1..]) {
            return None;
        }
        serde_json::from_str::<String>(&value[..i + 2]).ok()?
    } else {
        let plain = value
            .split_once(" #")
            .map_or(value, |(content, _)| content)
            .trim_end();
        if plain.starts_with(['*', '&', '!', '[', '{', '>', '|', '#', '@', '`'])
            || plain.contains(": ")
        {
            return None;
        }
        plain.into()
    };
    Some((key, value))
}

fn suffix(value: &str) -> bool {
    let text = value.trim_start();
    text.is_empty() || text.starts_with('#')
}

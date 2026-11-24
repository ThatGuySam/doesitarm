use crate::{
    Architecture, ReadAt, Result, ScanError, bundle,
    diagnostic::{ExecutableDiagnostic, Prefix},
    macho,
};
use serde::Serialize;
use std::collections::BTreeMap;

const MAX_SCRIPT: u64 = 16 * 1024;

#[derive(Debug, Serialize)]
pub struct ScriptRuntime {
    pub path: String,
    pub evidence: &'static str,
    pub architectures: Vec<Architecture>,
}

pub(crate) async fn inspect(
    input: &mut impl ReadAt,
    path: &str,
    architectures: &mut Vec<Architecture>,
    runtime: &mut Option<ScriptRuntime>,
    diagnostic: Option<&mut ExecutableDiagnostic>,
) -> Result<()> {
    if let Some(diagnostic) = diagnostic {
        *diagnostic = ExecutableDiagnostic::default();
        let mut prefixed = Prefix::open(input, diagnostic).await?;
        inspect_prefix(
            &mut prefixed,
            path,
            architectures,
            runtime,
            Some(diagnostic),
        )
        .await
    } else {
        inspect_prefix(input, path, architectures, runtime, None).await
    }
}

async fn inspect_prefix(
    input: &mut impl ReadAt,
    path: &str,
    architectures: &mut Vec<Architecture>,
    runtime: &mut Option<ScriptRuntime>,
    diagnostic: Option<&mut ExecutableDiagnostic>,
) -> Result<()> {
    let prefix = input.read_at(0, input.size().min(8) as usize).await?;
    if prefix.starts_with(b"#!") {
        let mut text = prefix;
        let size = input.size().min(MAX_SCRIPT) as usize;
        text.extend(input.read_at(text.len() as u64, size - text.len()).await?);
        *runtime = std::str::from_utf8(&text)
            .ok()
            .and_then(|script| reference(script, path));
        return Err(ScanError::Unsupported("declared executable is a script"));
    }
    if prefix.len() < 8 {
        return Err(ScanError::Invalid("short executable header"));
    }
    macho::scan_after_header(input, &prefix, architectures, diagnostic).await
}

fn reference(script: &str, path: &str) -> Option<ScriptRuntime> {
    let (directory, _) = path.rsplit_once('/')?;
    let mut variables: BTreeMap<&str, String> = BTreeMap::new();
    let mut references = Vec::new();
    let mut unresolved = false;
    for line in script.lines().map(str::trim) {
        if let Some((name, value)) = line.split_once('=')
            && !name.is_empty()
            && name
                .bytes()
                .all(|byte| byte.is_ascii_uppercase() || byte == b'_')
            && let Some(value) = quoted(value)
        {
            if let Some(value) = static_path(value, path, directory, &variables) {
                variables.insert(name, value);
            } else {
                variables.remove(name);
            }
        }
        let Some(command) = line.strip_prefix("exec ") else {
            continue;
        };
        let command = command.strip_prefix(r#"-a "$0" "#).unwrap_or(command);
        let Some(executable) = quoted_word(command) else {
            unresolved = true;
            continue;
        };
        if let Some(reference) = static_path(executable, path, directory, &variables)
            .and_then(|value| bundle::normalize_archive_path(&value))
        {
            references.push(reference);
        } else {
            unresolved = true;
        }
    }
    references.sort_unstable();
    references.dedup();
    let [resolved] = references.as_slice() else {
        return None;
    };
    (!unresolved && resolved != path).then(|| ScriptRuntime {
        path: resolved.clone(),
        evidence: "static_shell_exec_reference",
        architectures: Vec::new(),
    })
}

fn quoted(value: &str) -> Option<&str> {
    value.strip_prefix('"')?.strip_suffix('"')
}

fn quoted_word(command: &str) -> Option<&str> {
    let (word, rest) = command.strip_prefix('"')?.split_once('"')?;
    (rest.is_empty() || rest.starts_with(char::is_whitespace)).then_some(word)
}

fn static_path(
    expr: &str,
    launcher: &str,
    directory: &str,
    variables: &BTreeMap<&str, String>,
) -> Option<String> {
    match expr {
        r#"$0"# | r#"$(readlink -f "$0" 2>/dev/null || echo "$0")"# => {
            return Some(launcher.to_owned());
        }
        r#"$(dirname "$0")"#
        | r#"$(dirname "$(realpath "$0")")"#
        | r#"$(dirname "$(readlink "$0" || echo "$0")")"#
        | r#"$(cd "$(dirname "$0")" && pwd)"# => return Some(directory.to_owned()),
        _ => (),
    }
    if expr == r#"$(CDPATH= cd -- "$(dirname -- "$SELF")/.." && pwd -P)"#
        && script_directory(variables, launcher, "SELF")
    {
        return bundle::normalize_archive_path(&format!("{directory}/.."));
    }
    if let Some(variable) = expr.strip_prefix(r#"$(cd "$(dirname "$"#)
        && let Some(variable) = variable.strip_suffix(r#"")/.." && pwd)"#)
    {
        let parent = variables.get(variable)?.rsplit_once('/')?.0;
        return bundle::normalize_archive_path(&format!("{parent}/.."));
    }
    let expr = expr.strip_prefix('$')?;
    let (variable, tail) = if let Some(expr) = expr.strip_prefix('{') {
        expr.split_once('}')?
    } else {
        expr.split_once('/')
            .map_or((expr, ""), |(head, _)| (head, &expr[head.len()..]))
    };
    if !tail.is_empty() && !tail.starts_with('/') {
        return None;
    }
    if tail.contains(['$', '"', '\\', '`', '*', '?']) {
        return None;
    }
    let value = variables.get(variable)?;
    bundle::normalize_archive_path(&format!("{value}{tail}"))
}

fn script_directory(variables: &BTreeMap<&str, String>, path: &str, name: &str) -> bool {
    variables.get(name).is_some_and(|value| value == path)
}

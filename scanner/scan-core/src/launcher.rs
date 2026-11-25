use crate::{
    Architecture, ExecutableCandidate, ReadAt, Result, ScanError, ScanResult, bundle,
    decode::DecodeBudget,
    diagnostic::{ExecutableDiagnostic, Prefix},
    inventory, macho,
};
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};

const MAX_SCRIPT: u64 = 16 * 1024;

#[derive(Debug, Serialize)]
pub struct ScriptRuntime {
    pub path: String,
    pub evidence: &'static str,
    pub architectures: Vec<Architecture>,
}

pub(crate) struct Candidate {
    pub path: String,
    pub size: u64,
    pub architectures: Vec<Architecture>,
    pub outcome: Result<()>,
    runtime: Option<ScriptRuntime>,
    diagnostic: Option<ExecutableDiagnostic>,
}

impl Candidate {
    pub(crate) fn apply(self, out: &mut ScanResult) -> Result<()> {
        out.executable_size = Some(self.size);
        out.architectures = self.architectures;
        if let (Some(result), Some(diagnostic)) = (&mut out.diagnostic, self.diagnostic) {
            result.executable = diagnostic;
        }
        out.script_runtime = self.runtime;
        self.outcome
    }

    fn is_executable(&self) -> bool {
        self.outcome.is_ok()
            && !self.architectures.is_empty()
            && self
                .architectures
                .iter()
                .all(|arch| arch.header_verified && arch.file_type == Some(macho::MH_EXECUTE))
    }
}

pub(crate) async fn observe(
    input: &mut impl ReadAt,
    path: &str,
    diagnostic: bool,
) -> Result<Candidate> {
    let mut architectures = Vec::new();
    let mut runtime = None;
    let mut diagnostic = diagnostic.then(ExecutableDiagnostic::default);
    let outcome = inspect(
        input,
        path,
        &mut architectures,
        &mut runtime,
        diagnostic.as_mut(),
    )
    .await;
    if let Err(error) = &outcome
        && inventory::stop(error)
        && architectures.is_empty()
    {
        return Err(error.clone());
    }
    Ok(Candidate {
        path: path.to_owned(),
        size: input.size(),
        architectures,
        outcome,
        runtime,
        diagnostic,
    })
}

// A root executable, a single enclosing directory, or that directory's bin/.
// Deep helpers and bundle internals need a declared target.
pub(crate) fn standalone_path(path: &str) -> Option<&str> {
    let path = bundle::archive_path(path)?;
    if path
        .split('/')
        .any(|part| part.is_empty() || part.starts_with('.'))
    {
        return None;
    }
    let mut parts = path.rsplit('/');
    parts.next()?;
    let parent = parts.next();
    let product = parts.next();
    if parts.next().is_some() || product.is_some() && parent != Some("bin") {
        return None;
    }
    let allowed = |directory: &str| {
        !matches!(
            directory,
            "Contents" | "Resources" | "Frameworks" | "PlugIns" | "lib" | "runtime"
        ) && bundle::installed_bundle_kind(directory).is_none()
            && ![".framework", ".appex", ".xpc", ".bundle", ".pkg"]
                .iter()
                .any(|suffix| directory.ends_with(suffix))
    };
    (parent.is_none_or(allowed) && product.is_none_or(allowed)).then_some(path)
}

#[derive(Default)]
pub(crate) struct Standalone {
    candidates: Vec<Candidate>,
    probes: usize,
    limited: bool,
}

impl Standalone {
    pub(crate) fn allow(&mut self, work: &DecodeBudget<'_>) -> bool {
        let limit = if work.strict() {
            8
        } else if work.local() {
            128
        } else {
            32
        };
        if self.probes == limit {
            self.limited = true;
            return false;
        }
        self.probes += 1;
        true
    }

    pub(crate) async fn inspect(
        &mut self,
        input: &mut impl ReadAt,
        path: &str,
        diagnostic: bool,
    ) -> Result<()> {
        let candidate = observe(input, path, diagnostic).await?;
        if let Err(error) = &candidate.outcome
            && inventory::stop(error)
        {
            return Err(error.clone());
        }
        if candidate.is_executable()
            || matches!(
                candidate.outcome,
                Err(ScanError::Unsupported("declared executable is a script"))
            )
        {
            self.candidates.push(candidate);
        }
        Ok(())
    }

    pub(crate) fn finish(mut self, out: &mut ScanResult, missing: ScanError) -> Result<()> {
        if self.limited {
            return Err(ScanError::Limit(
                "too many standalone executable candidates",
            ));
        }
        // A verified binary named by a packaged script is runtime evidence.
        // It does not supply that script's own architecture.
        let mut referenced = BTreeSet::new();
        for index in 0..self.candidates.len() {
            if let Some(runtime) = self.candidates[index].runtime.as_ref()
                && let Some(binary) = self
                    .candidates
                    .iter()
                    .find(|entry| entry.path == runtime.path && entry.is_executable())
            {
                referenced.insert(binary.path.clone());
                let architectures = binary.architectures.clone();
                self.candidates[index]
                    .runtime
                    .as_mut()
                    .unwrap()
                    .architectures = architectures;
            }
        }
        self.candidates
            .retain(|candidate| !referenced.contains(&candidate.path));
        match self.candidates.len() {
            0 => Err(missing),
            1 => {
                let candidate = self.candidates.pop().unwrap();
                out.executable_path = Some(candidate.path.clone());
                candidate.apply(out)
            }
            _ => {
                self.candidates.sort_by(|a, b| a.path.cmp(&b.path));
                out.candidate_executables = self
                    .candidates
                    .into_iter()
                    .map(|candidate| ExecutableCandidate {
                        path: candidate.path,
                        size: candidate.size,
                        architectures: candidate.architectures,
                    })
                    .collect();
                Err(ScanError::Unsupported(
                    "multiple standalone executables; select a binary path",
                ))
            }
        }
    }
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

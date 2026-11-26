use super::{
    Result, privacy,
    trace::{MAGIC, Trace},
};
use flate2::Compression;
use std::{fmt::Write as _, io, path::Path};

pub(super) const LIMIT: u64 = 50_000;
const TEMPLATE: &str = r#"
fn assert_replay(bytes: &[u8]) {
    use std::{io::Write, process::{Command, Stdio}};

    let mut scan = Command::new(env!("CARGO_BIN_EXE_scan-cli"))
        .args(["shim", "replay", "-"])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .expect("start offline scanner");
    let input = scan.stdin.take().unwrap().write_all(bytes);
    let result = scan.wait_with_output().unwrap();
    assert!(result.status.success(), "{}", String::from_utf8_lossy(&result.stderr));
    input.expect("send fixture");
}
"#;

pub(super) fn test(trace: &mut Trace, path: &Path, blob: bool) -> Result<()> {
    if path.extension().and_then(|ext| ext.to_str()) != Some("rs") {
        return Err("Fixture test destination must end in .rs".into());
    }
    if path.exists() {
        return Err("Fixture test destination already exists".into());
    }
    trace.verify()?;
    trace.seal();
    let generator = if blob { None } else { rust_source(trace)? };
    if let Some(source) = generator {
        verify_privacy(trace)?;
        return write_new(path, source.as_bytes());
    }

    let mut compressed = Bounded(Vec::new());
    trace.encode(&mut compressed, Compression::best())?;
    verify_privacy(trace)?;

    let payload = path.with_extension("shim");
    let file = payload
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("Expected a UTF-8 fixture name")?;
    let source = format!(
        "// Review archive bytes and provenance before committing this fixture.\n\
         #[test]\nfn replays_shim() {{\n    assert_replay(include_bytes!({file:?}));\n}}\n{TEMPLATE}"
    );
    write_new(&payload, &compressed.0)?;
    if let Err(error) = write_new(path, source.as_bytes()) {
        std::fs::remove_file(payload)?;
        return Err(error);
    }
    Ok(())
}

fn verify_privacy(trace: &Trace) -> Result<()> {
    if privacy::safe_binary(&trace.payload) {
        Ok(())
    } else {
        Err("Fixture bytes contain a recognizable user path or credential".into())
    }
}

fn rust_source(trace: &Trace) -> Result<Option<String>> {
    let nonzero = trace
        .payload
        .iter()
        .filter(|&&byte| byte != 0)
        .take(900)
        .count();
    if nonzero == 900 {
        return Ok(None);
    }

    let mut source = String::from(
        "// Review archive bytes and provenance before committing this fixture.\n\
         #[test]\nfn replays_shim() {\n    use std::io::Write;\n",
    );
    writeln!(
        source,
        "    let header = {:?};",
        serde_json::to_string(&trace.header)?
    )?;
    if trace.payload.is_empty() {
        writeln!(source, "    let payload = [];")?;
    } else {
        writeln!(
            source,
            "    let mut payload = vec![0_u8; {}];",
            trace.payload.len()
        )?;
        let mut offset = 0;
        while let Some(start) = trace.payload[offset..].iter().position(|&byte| byte != 0) {
            let start = offset + start;
            let end = start
                + trace.payload[start..]
                    .iter()
                    .position(|&byte| byte == 0)
                    .unwrap_or(trace.payload.len() - start);
            writeln!(
                source,
                "    payload[{start}..{end}].copy_from_slice(&{:?});",
                &trace.payload[start..end]
            )?;
            offset = end;
        }
    }
    writeln!(source, "    let mut fixture = vec!{:?};", MAGIC)?;
    source.push_str(
        "    let mut gzip = flate2::write::GzEncoder::new(&mut fixture, flate2::Compression::fast());\n\
         \x20   writeln!(gzip, \"{header}\").unwrap();\n\
         \x20   gzip.write_all(&payload).unwrap();\n\
         \x20   gzip.finish().unwrap();\n\
         \x20   assert_replay(&fixture);\n}\n",
    );
    source.push_str(TEMPLATE);
    Ok((source.len() < LIMIT as usize).then_some(source))
}

fn write_new(path: &Path, bytes: &[u8]) -> Result<()> {
    use std::io::Write;
    let parent = path
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let mut file = tempfile::NamedTempFile::new_in(parent)?;
    file.write_all(bytes)?;
    file.persist_noclobber(path)?;
    Ok(())
}

struct Bounded(Vec<u8>);

impl io::Write for Bounded {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if self.0.len().saturating_add(bytes.len()) >= LIMIT as usize {
            return Err(io::Error::other(
                "Compressed trace exceeds 50 KB. Generate a structural fixture",
            ));
        }
        self.0.extend_from_slice(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

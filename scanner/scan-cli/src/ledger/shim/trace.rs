use super::{Result, Signature};
use crate::Output;
use crate::ledger::{
    capture::{self, Capture, CapturedError, HttpEvidence, Phase, SHIM_BYTES, SHIM_LOG},
    kit, live, privacy,
    store::Settings,
};
use flate2::{Compression, read::GzDecoder, write::GzEncoder};
use serde::{Deserialize, Serialize};
use std::{
    fs::File,
    io::{BufRead, BufReader, Read, Write},
    path::Path,
};

pub(super) const MAGIC: &[u8] = b"SHIM\0\x01";
const MAX_HEADER: u64 = 32 * 1024 * 1024;

#[derive(Deserialize, Serialize)]
pub(super) struct Header {
    pub(super) settings: Settings,
    pub(super) decoded_budget: Option<u64>,
    pub(super) expected: Signature,
    pub(super) probe: Option<HttpEvidence>,
    pub(super) probe_error: Option<CapturedError>,
    pub(super) phases: Vec<Phase>,
    original_len: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    validator_sha256: Option<String>,
    payload_len: usize,
    payload_sha256: String,
}

pub(super) struct Trace {
    pub(super) header: Header,
    pub(super) payload: Vec<u8>,
}

impl Trace {
    pub(super) fn from_capture(
        capture: Capture,
        settings: Settings,
        decoded_budget: Option<u64>,
        output: &Output,
    ) -> Result<Self> {
        if capture.over_limit || capture.phases.iter().any(|p| p.log_overflow > 0) {
            return Err(
                "Capture exceeded the shim limits. Try a smaller tier or a generated artifact"
                    .into(),
            );
        }
        let header = Header {
            settings,
            decoded_budget,
            expected: Signature::from_output(output)?,
            probe: capture.probe,
            probe_error: capture.probe_error,
            phases: capture.phases,
            original_len: 0,
            validator_sha256: None,
            payload_len: 0,
            payload_sha256: String::new(),
        };
        Self::new(header, capture.payload)
    }

    pub(super) fn from_kit(path: &Path) -> Result<Self> {
        let (kit, payload) = kit::load(path)?;
        let (class, output) = kit.replay(&payload)?;
        if class != kit.expected_class {
            return Err(format!(
                "Ledger kit expected {}, replay found {class}",
                kit.expected_class
            )
            .into());
        }
        let header = Header {
            settings: kit.settings,
            decoded_budget: None,
            expected: Signature::from_json(&output)?,
            probe: kit.probe,
            probe_error: None,
            phases: kit.phases,
            original_len: 0,
            validator_sha256: None,
            payload_len: 0,
            payload_sha256: String::new(),
        };
        Self::new(header, payload)
    }

    fn new(mut header: Header, payload: Vec<u8>) -> Result<Self> {
        header.settings.flags.clear();
        header.settings.deadline_ms = None;
        header.settings.timeout_ms = None;
        if let Some(target) = &header.settings.target
            && target["path"]
                .as_str()
                .is_some_and(|path| privacy::text(path) != path)
        {
            return Err("Archive selector contains a private path or credential".into());
        }
        header.validator_sha256 = header
            .probe
            .as_ref()
            .and_then(|response| response.headers.get("etag"))
            .or_else(|| {
                header
                    .phases
                    .iter()
                    .find_map(|phase| phase.source_etag.as_ref())
            })
            .map(privacy::sha);
        for phase in &mut header.phases {
            phase.source_etag = None;
            phase.source_content_type = None;
            phase.response = None;
        }
        if let Some(probe) = &mut header.probe {
            probe.final_url.clear();
            probe.redirects.clear();
            // Replaying a rejected 206 requires the captured error. All other
            // rejected probe statuses are validated without response headers.
            probe.headers.clear();
        }
        header.original_len = header
            .phases
            .iter()
            .map(|phase| phase.size)
            .max()
            .unwrap_or(0);
        let trace = Self { header, payload };
        trace.verify()?;
        Ok(trace)
    }

    pub(super) fn replay(&self) -> Result<Signature> {
        let mut limits = live::limits(&self.header.settings)?;
        if let Some(decoded) = self.header.decoded_budget {
            limits.decoded_byte_budget = decoded;
        }
        let target = live::target(&self.header.settings);
        let phase_replay =
            capture::replay_phases(&self.header.phases, &self.payload, limits, target)?;
        let output = if let Some(output) = phase_replay {
            output
        } else if let Some(probe) = &self.header.probe
            && probe.status != 206
        {
            capture::probe_replay(probe)?
        } else if let Some(error) = &self.header.probe_error {
            capture::probe_error_replay(error)
        } else {
            return Err("Trace contains no parser reads or probe failure".into());
        };
        Signature::from_output(&output)
    }

    pub(super) fn verify(&self) -> Result<()> {
        let actual = self.replay()?;
        if self.header.expected != actual {
            return Err(format!(
                "Replay outcome changed\nexpected: {}\nactual:   {}",
                serde_json::to_string(&self.header.expected)?,
                serde_json::to_string(&actual)?,
            )
            .into());
        }
        Ok(())
    }

    pub(super) fn load(path: &Path) -> Result<Self> {
        if path == Path::new("-") {
            Self::decode(std::io::stdin().lock())
        } else {
            Self::decode(File::open(path)?)
        }
    }

    fn decode(mut input: impl Read) -> Result<Self> {
        let mut magic = [0; MAGIC.len()];
        input.read_exact(&mut magic)?;
        if magic != MAGIC {
            return Err("Unrecognized shim trace version".into());
        }
        let mut input = BufReader::new(GzDecoder::new(input));
        let mut header = Vec::new();
        if (&mut input)
            .take(MAX_HEADER + 1)
            .read_until(b'\n', &mut header)? as u64
            > MAX_HEADER
        {
            return Err("Shim trace header exceeds its limit".into());
        }
        let header: Header = serde_json::from_slice(&header)?;
        if header.payload_len > SHIM_BYTES {
            return Err("Shim trace payload exceeds its limit".into());
        }
        let mut payload = Vec::new();
        (&mut input)
            .take(header.payload_len as u64 + 1)
            .read_to_end(&mut payload)?;
        if payload.len() != header.payload_len || privacy::sha(&payload) != header.payload_sha256 {
            return Err("Shim trace payload length or SHA-256 does not match".into());
        }
        for phase in &header.phases {
            if phase.read_log.len() > SHIM_LOG || phase.log_overflow > 0 {
                return Err("Shim trace does not retain its complete read log".into());
            }
            for span in &phase.read_log {
                if let Some(start) = span.payload_offset
                    && (start
                        .checked_add(span.length)
                        .is_none_or(|end| end > payload.len())
                        || span
                            .offset
                            .checked_add(span.length as u64)
                            .is_none_or(|end| end > phase.size))
                {
                    return Err("Shim trace contains a range outside its recorded bounds".into());
                }
            }
        }
        Ok(Self { header, payload })
    }

    pub(super) fn seal(&mut self) {
        self.header.payload_len = self.payload.len();
        self.header.payload_sha256 = privacy::sha(&self.payload);
    }

    pub(super) fn encode(&self, mut out: impl Write, compression: Compression) -> Result<()> {
        out.write_all(MAGIC)?;
        let mut out = GzEncoder::new(out, compression);
        serde_json::to_writer(&mut out, &self.header)?;
        out.write_all(b"\n")?;
        out.write_all(&self.payload)?;
        out.try_finish()?;
        Ok(())
    }

    pub(super) fn save(&mut self, path: &Path, compression: Compression) -> Result<u64> {
        self.seal();
        let parent = path
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new("."));
        let mut file = tempfile::NamedTempFile::new_in(parent)?;
        self.encode(&mut file, compression)?;
        let len = file.as_file().metadata()?.len();
        file.persist_noclobber(path)?;
        Ok(len)
    }

    pub(super) fn original_bytes(&self) -> u64 {
        self.header.original_len
    }

    pub(super) fn validator(&self) -> Option<&str> {
        self.header.validator_sha256.as_deref()
    }

    pub(super) fn logical_bytes(&self) -> u64 {
        self.header.phases.iter().map(|p| p.size).max().unwrap_or(0)
    }
}

use crate::{ReadAt, Result, ScanError, ScanResult, local_bundle::serialize_plist, macho};
use plist::Value;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, fmt::Write};

#[derive(Debug, Default, Serialize)]
pub struct ScanDiagnostic {
    pub info_plist_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub info_plist_sha256: Option<String>,
    pub info_plist_size: Option<usize>,
    pub info_plist_encoding: Option<&'static str>,
    pub info_plist_keys: Vec<String>,
    #[serde(serialize_with = "serialize_plist")]
    pub info_plist: Option<Value>,
    #[serde(flatten)]
    pub executable: ExecutableDiagnostic,
}

impl ScanDiagnostic {
    pub(crate) fn fingerprints() -> Self {
        Self {
            executable: ExecutableDiagnostic {
                fingerprints_only: true,
                ..ExecutableDiagnostic::default()
            },
            ..Self::default()
        }
    }

    pub(crate) fn plist_source(&mut self, bundle: &str, bytes: &[u8]) {
        if self.executable.fingerprints_only {
            self.info_plist_sha256 = Some(digest(&[bytes]));
            return;
        }
        self.info_plist_path = Some(format!("{bundle}/Contents/Info.plist"));
        self.info_plist_size = Some(bytes.len());
        self.info_plist_encoding = Some(plist_encoding(bytes));
        self.info_plist_keys.clear();
        self.info_plist = None;
    }

    pub(crate) fn plist_value(&mut self, value: Value) {
        if self.executable.fingerprints_only {
            return;
        }
        if let Some(dict) = value.as_dictionary() {
            self.info_plist_keys = dict.keys().cloned().collect();
        }
        self.info_plist = Some(value);
    }
}

pub(crate) fn plist_encoding(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(b"bplist00") {
        "binary"
    } else if bytes.starts_with(b"\xef\xbb\xbf") {
        "xml_bom"
    } else {
        "xml"
    }
}

#[derive(Debug, Default, Serialize)]
pub struct ExecutableDiagnostic {
    pub executable_prefix_hex: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub main_executable_header_sha256: Option<String>,
    #[serde(skip)]
    pub(crate) fingerprints_only: bool,
    pub load_commands: Vec<SliceCommands>,
}

impl ExecutableDiagnostic {
    pub(crate) fn header(&mut self, first: &[u8], rest: &[u8]) {
        if self.fingerprints_only {
            self.main_executable_header_sha256 = Some(digest(&[first, rest]));
        }
    }

    pub(crate) fn prefix(&mut self, bytes: &[u8]) {
        let mut hex = String::with_capacity(bytes.len() * 2);
        for byte in bytes {
            let _ = write!(hex, "{byte:02x}");
        }
        self.executable_prefix_hex = Some(hex);
    }
}

#[derive(Debug, Serialize)]
pub struct SliceCommands {
    pub slice_offset: u64,
    pub commands: Vec<Command>,
    pub truncated: bool,
}

#[derive(Debug, Serialize)]
pub struct Command {
    pub id: u32,
    pub size: u32,
    pub fields: BTreeMap<&'static str, u64>,
}

impl ScanResult {
    pub(crate) fn subresult(&self) -> Self {
        let mut result = Self::new(self.total_size);
        result.diagnostic = self.diagnostic.as_ref().map(|evidence| {
            if evidence.executable.fingerprints_only {
                ScanDiagnostic::fingerprints()
            } else {
                ScanDiagnostic::default()
            }
        });
        result
    }

    pub(crate) async fn scan_macho(&mut self, input: &mut impl ReadAt) -> Result<()> {
        macho::scan(
            input,
            &mut self.architectures,
            self.diagnostic
                .as_mut()
                .map(|diagnostic| &mut diagnostic.executable),
        )
        .await
    }
}

/// Replay the captured prefix to readers with forward-only decoded streams.
pub(crate) struct Prefix<'a, S> {
    source: &'a mut S,
    bytes: Vec<u8>,
}

impl<'a, S: ReadAt> Prefix<'a, S> {
    pub(crate) async fn open(
        source: &'a mut S,
        diagnostic: &mut ExecutableDiagnostic,
    ) -> Result<Self> {
        let length = source.size().min(64) as usize;
        let bytes = source.read_at(0, length).await?;
        diagnostic.prefix(&bytes);
        Ok(Self { source, bytes })
    }
}

impl<S: ReadAt> ReadAt for Prefix<'_, S> {
    fn size(&self) -> u64 {
        self.source.size()
    }

    fn remaining_budget(&self) -> u64 {
        self.source.remaining_budget()
    }

    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>> {
        if offset >= self.bytes.len() as u64 {
            return self.source.read_at(offset, len).await;
        }
        let at = offset as usize;
        let covered = len.min(self.bytes.len() - at);
        let mut bytes = self.bytes[at..at + covered].to_vec();
        if covered < len {
            bytes.extend(
                self.source
                    .read_at(offset + covered as u64, len - covered)
                    .await?,
            );
        }
        if bytes.len() == len {
            Ok(bytes)
        } else {
            Err(ScanError::Source(
                "incomplete diagnostic prefix read".into(),
            ))
        }
    }
}

fn digest(parts: &[&[u8]]) -> String {
    let mut hash = Sha256::new();
    for part in parts {
        hash.update(part);
    }
    let mut hex = String::with_capacity(64);
    for byte in hash.finalize() {
        write!(hex, "{byte:02x}").unwrap();
    }
    hex
}

use crate::{
    AnyResult, Failure,
    http::{BodyMode, Request, Response, Traffic, Transport},
    public_url,
};
use serde::Deserialize;
use std::{collections::BTreeMap, fs::File, io::Read, path::Path};

const MAX_BYTES: u64 = 256 * 1024;

#[derive(Debug, Deserialize)]
pub struct Fixture {
    #[serde(default)]
    responses: Vec<Exchange>,
    #[serde(default)]
    assets: BTreeMap<String, Asset>,
}

#[derive(Debug, Deserialize)]
struct Exchange {
    url: String,
    mode: String,
    #[serde(default)]
    final_url: Option<String>,
    status: u16,
    #[serde(default)]
    headers: BTreeMap<String, String>,
    #[serde(default)]
    body_text: String,
    #[serde(default)]
    body_hex: String,
}

#[derive(Debug, Deserialize)]
struct Asset {
    hex: String,
    #[serde(default)]
    etag: Option<String>,
}

impl Fixture {
    pub fn open(path: &Path) -> AnyResult<Self> {
        let mut data = Vec::new();
        File::open(path)?
            .take(MAX_BYTES + 1)
            .read_to_end(&mut data)?;
        if data.len() as u64 > MAX_BYTES {
            return Err("fixture exceeds 256 KiB".into());
        }
        Ok(serde_json::from_slice(&data)?)
    }
}

impl Transport for Fixture {
    fn fetch(&self, request: Request, stats: &mut Traffic) -> Result<Response, Failure> {
        let mode = match request.mode {
            BodyMode::Head => "head".into(),
            BodyMode::Metadata(_) => "metadata".into(),
            BodyMode::Robots => "robots".into(),
            BodyMode::Range { start, end } => format!("bytes={start}-{end}"),
        };
        let mut result = Response {
            url: request.url.clone(),
            status: 0,
            headers: BTreeMap::new(),
            body: Vec::new(),
            received: 0,
            too_large: false,
            read_failure: None,
        };
        if let Some(ex) = self
            .responses
            .iter()
            .find(|ex| ex.url == request.url.as_str() && ex.mode == mode)
        {
            result.status = ex.status;
            result.headers = ex
                .headers
                .iter()
                .map(|(key, value)| (key.to_ascii_lowercase(), value.clone()))
                .collect();
            result.body = if ex.body_hex.is_empty() {
                ex.body_text.as_bytes().to_vec()
            } else {
                decode_hex(&ex.body_hex)?
            };
            if let Some(url) = &ex.final_url {
                result.url = public_url(url)?;
            }
        } else if let Some(asset) = self.assets.get(request.url.as_str()) {
            let bytes = decode_hex(&asset.hex)?;
            match request.mode {
                BodyMode::Head => {
                    result.status = 200;
                    result
                        .headers
                        .insert("content-length".into(), bytes.len().to_string());
                }
                BodyMode::Range { start, end } => {
                    let a = usize::try_from(start)
                        .map_err(|_| fixture_error("range start out of bounds"))?;
                    let b = usize::try_from(end)
                        .map_err(|_| fixture_error("range end out of bounds"))?;
                    if let Some(slice) = bytes.get(a..=b) {
                        result.status = 206;
                        result.headers.insert(
                            "content-range".into(),
                            format!("bytes {start}-{end}/{}", bytes.len()),
                        );
                        result
                            .headers
                            .insert("content-length".into(), slice.len().to_string());
                        result.body.extend_from_slice(slice);
                    } else {
                        result.status = 416;
                    }
                }
                _ => {
                    return Err(fixture_error(
                        "asset entries serve HEAD and range requests only",
                    ));
                }
            }
            if let Some(tag) = &asset.etag {
                result.headers.insert("etag".into(), tag.clone());
            }
        } else {
            return Err(fixture_error(format!(
                "no offline exchange for {mode} on {}",
                crate::recorded_url(request.url.as_str())
            )));
        }
        result.received = result.body.len();
        stats.requests += 1;
        stats.bytes += result.received as u64;
        Ok(result)
    }
}

fn fixture_error(message: impl Into<String>) -> Failure {
    Failure::new("fixture_miss", message)
}

fn decode_hex(value: &str) -> Result<Vec<u8>, Failure> {
    let data = value.as_bytes().chunks_exact(2);
    if !data.remainder().is_empty() {
        return Err(fixture_error("invalid fixture hex length"));
    }
    data.map(|pair| {
        let byte = |value: u8| (value as char).to_digit(16).map(|n| n as u8);
        byte(pair[0])
            .zip(byte(pair[1]))
            .map(|(a, b)| a * 16 + b)
            .ok_or_else(|| fixture_error("invalid fixture hex"))
    })
    .collect()
}

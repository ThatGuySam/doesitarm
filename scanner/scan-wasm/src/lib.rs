#![forbid(unsafe_code)]
#![cfg(target_arch = "wasm32")]

use js_sys::{BigInt, Function, Promise, RangeError, Uint8Array};
use scan_core::{
    Profile, ReadAt, Result, ScanError, ScanLimits, ScanResult, Target, WORKER_WALL_TIME_MS,
};
use wasm_bindgen::{JsCast, prelude::*};
use wasm_bindgen_futures::JsFuture;

const MAX_SAFE_INTEGER: u64 = (1 << 53) - 1;

struct JsSource {
    total_size: u64,
    read_at: Function,
}

impl ReadAt for JsSource {
    fn size(&self) -> u64 {
        self.total_size
    }

    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>> {
        let value = self
            .read_at
            .call2(&JsValue::UNDEFINED, &offset.into(), &(len as u32).into())
            .map_err(|_| ScanError::Source("JavaScript readAt threw".into()))?;
        let value = JsFuture::from(Promise::resolve(&value))
            .await
            .map_err(|_| ScanError::Source("JavaScript readAt rejected".into()))?;
        let bytes = value
            .dyn_into::<Uint8Array>()
            .map_err(|_| ScanError::Source("JavaScript readAt must return a Uint8Array".into()))?;
        if bytes.length() as usize != len {
            return Err(ScanError::Source(format!(
                "JavaScript range at {offset} expected {len} bytes, received {}",
                bytes.length(),
            )));
        }
        Ok(bytes.to_vec())
    }
}

/// `read_at(offset: bigint, length: number)` can return a Uint8Array
/// immediately or resolve one asynchronously. Sizes must fit in a JS safe
/// integer. Budgets are unsigned BigInts. The result is a JSON string.
#[wasm_bindgen]
pub async fn scan(
    total_size: BigInt,
    budget: BigInt,
    read_at: Function,
    decoded_byte_budget: Option<BigInt>,
    profile: Option<String>,
    expired: Option<Function>,
) -> std::result::Result<String, JsValue> {
    scan_with_target(
        total_size,
        budget,
        read_at,
        Target::Auto,
        decoded_byte_budget,
        profile,
        expired,
    )
    .await
}

#[wasm_bindgen]
pub async fn scan_target(
    total_size: BigInt,
    budget: BigInt,
    read_at: Function,
    kind: &str,
    path: &str,
    decoded_byte_budget: Option<BigInt>,
    profile: Option<String>,
) -> std::result::Result<String, JsValue> {
    let target = match kind {
        "bundle" => Target::Bundle(path),
        "executable" => Target::Executable(path),
        _ => {
            return Err(JsValue::from_str(
                "Expected bundle or executable target kind",
            ));
        }
    };
    scan_with_target(
        total_size,
        budget,
        read_at,
        target,
        decoded_byte_budget,
        profile,
        None,
    )
    .await
}

async fn scan_with_target(
    total_size: BigInt,
    budget: BigInt,
    read_at: Function,
    target: Target<'_>,
    decoded_byte_budget: Option<BigInt>,
    profile: Option<String>,
    expired: Option<Function>,
) -> std::result::Result<String, JsValue> {
    let total_size = u64::try_from(total_size)
        .ok()
        .filter(|&size| size <= MAX_SAFE_INTEGER)
        .ok_or_else(|| RangeError::new("total size must be between 0 and 2^53 - 1"))?;
    let profile: Profile = profile
        .as_deref()
        .unwrap_or("worker")
        .parse()
        .map_err(JsValue::from_str)?;
    let mut limits = ScanLimits::for_profile(profile);
    limits.byte_budget = parse_budget(budget)?;
    if let Some(decoded) = decoded_byte_budget {
        limits.decoded_byte_budget = parse_budget(decoded)?;
    }
    let mut source = JsSource {
        total_size,
        read_at,
    };
    let start = (profile == Profile::Worker).then(js_sys::Date::now);
    let deadline = || {
        start.is_some_and(|start| js_sys::Date::now() - start >= f64::from(WORKER_WALL_TIME_MS))
            || expired.as_ref().is_some_and(|expired| {
                expired
                    .call0(&JsValue::UNDEFINED)
                    .ok()
                    .and_then(|value| value.as_bool())
                    .unwrap_or(true)
            })
    };
    let check = (start.is_some() || expired.is_some()).then_some(&deadline as &dyn Fn() -> bool);
    let result = scan_core::scan_target_with_deadline(&mut source, limits, target, check).await;
    check_result_sizes(&result)?;
    serde_json::to_string(&result).map_err(|error| JsValue::from_str(&error.to_string()))
}

fn parse_budget(value: BigInt) -> std::result::Result<u64, JsValue> {
    u64::try_from(value)
        .map_err(|_| RangeError::new("budgets must be unsigned 64-bit BigInts").into())
}

fn check_result_sizes(result: &ScanResult) -> std::result::Result<(), JsValue> {
    // Sizes inside an archive can exceed its physical source size.
    let counts = [
        result.total_size,
        result.bytes_read,
        result.bytes_requested,
        result.decoded_bytes,
        result.reads,
    ];
    let sizes = counts.into_iter().chain(result.executable_size).chain(
        result
            .candidate_executables
            .iter()
            .map(|candidate| candidate.size),
    );
    let architectures = result.architectures.iter().chain(
        result
            .candidate_executables
            .iter()
            .flat_map(|candidate| &candidate.architectures),
    );
    if sizes
        .chain(architectures.flat_map(|arch| [arch.offset, arch.size]))
        .any(|size| size > MAX_SAFE_INTEGER)
    {
        return Err(RangeError::new(
            "embedded file size or offset exceeds the JS safe integer range",
        )
        .into());
    }
    Ok(())
}

/// Parse an XML or binary Info.plist using the archive scanner's metadata rules.
#[wasm_bindgen]
pub fn bundle_metadata(plist: &[u8], bundle_path: &str) -> std::result::Result<String, JsValue> {
    let result = scan_core::bundle_metadata(plist, bundle_path);
    serde_json::to_string(&result).map_err(|error| JsValue::from_str(&error.to_string()))
}

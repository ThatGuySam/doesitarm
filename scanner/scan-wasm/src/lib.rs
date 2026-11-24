#![forbid(unsafe_code)]
#![cfg(target_arch = "wasm32")]

use js_sys::{Function, Promise, Uint8Array};
use scan_core::{ReadAt, Result, ScanError};
use wasm_bindgen::{JsCast, prelude::*};
use wasm_bindgen_futures::JsFuture;

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
/// immediately or resolve one asynchronously. The result is a JSON string.
#[wasm_bindgen]
pub async fn scan(
    total_size: u64,
    budget: u64,
    read_at: Function,
) -> std::result::Result<String, JsValue> {
    let mut source = JsSource {
        total_size,
        read_at,
    };
    let result = scan_core::scan(&mut source, budget).await;
    serde_json::to_string(&result).map_err(|error| JsValue::from_str(&error.to_string()))
}

/// Parse an XML or binary Info.plist using the archive scanner's metadata rules.
#[wasm_bindgen]
pub fn bundle_metadata(plist: &[u8], bundle_path: &str) -> std::result::Result<String, JsValue> {
    let result = scan_core::bundle_metadata(plist, bundle_path);
    serde_json::to_string(&result).map_err(|error| JsValue::from_str(&error.to_string()))
}

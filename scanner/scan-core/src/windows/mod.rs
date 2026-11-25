mod pe;
mod version;

pub(crate) use pe::inspect as pe;
use serde::Serialize;

#[derive(Clone, Debug, Default, Serialize)]
pub struct Windows {
    pub architectures: Vec<&'static str>,
    pub main_architecture: Option<&'static str>,
    pub native_arm64: bool,
    pub arm64ec: bool,
    pub arm64x: bool,
    pub emulated_only: bool,
    pub dotnet: Option<DotNet>,
    pub machine: Option<u16>,
    pub subsystem: Option<u16>,
    pub installer_kind: Option<&'static str>,
    pub payload_status: Option<&'static str>,
    pub product_name: Option<String>,
    pub version: Option<String>,
    pub publisher: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct DotNet {
    pub il_only: bool,
    pub any_cpu: bool,
    pub requires_32bit: bool,
    pub prefers_32bit: bool,
}

impl Windows {
    fn observe(&mut self, arch: &'static str) {
        if !self.architectures.contains(&arch) {
            self.architectures.push(arch);
        }
    }

    fn finish(&mut self) {
        self.native_arm64 = self
            .architectures
            .iter()
            .any(|a| matches!(*a, "arm64" | "arm64x"));
        self.arm64ec = self
            .architectures
            .iter()
            .any(|a| matches!(*a, "arm64ec" | "arm64x"));
        self.arm64x = self.architectures.contains(&"arm64x");
        self.emulated_only = !self.architectures.is_empty()
            && self
                .architectures
                .iter()
                .all(|a| matches!(*a, "x86" | "x64"))
            && self.payload_status.is_none();
    }

    pub(crate) fn set_result(mut self, result: &mut crate::ScanResult) {
        self.finish();
        result.platform = crate::Platform::Windows;
        result.name.clone_from(&self.product_name);
        result.version.clone_from(&self.version);
        result.windows = Some(self);
    }
}

// Product fields are descriptive metadata. Do not return paths, URLs, control
// characters, or unusually long strings supplied by an untrusted artifact.
fn label(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()
        && value.chars().count() <= 200
        && !value.contains(['/', '\\', '@'])
        && !value.chars().any(char::is_control))
    .then(|| value.to_owned())
}

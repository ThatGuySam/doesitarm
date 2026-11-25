pub(crate) mod cab;
mod installer;
mod msi;
pub(crate) mod package;
mod pe;
mod version;

pub(crate) use msi::inspect as msi;
pub(crate) use pe::{inspect as pe, inspect_prefix as pe_prefix};

pub(crate) const UNKNOWN_PAYLOAD: &str = "unknown, installer payload not inspectable";
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
    pub bootstrapper_architecture: Option<&'static str>,
    pub architecture_source: Option<&'static str>,
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
    pub(crate) fn observe(&mut self, arch: &'static str) {
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
        self.emulated_only = self.subsystem != Some(1)
            && !matches!(
                self.architecture_source,
                Some("pe_machine" | "archive_pe_machine")
            )
            && !self.architectures.is_empty()
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

pub(crate) fn pe_extension(path: &str) -> Option<bool> {
    let extension = path.rsplit_once('.')?.1;
    if extension.eq_ignore_ascii_case("exe") {
        Some(true)
    } else if ["dll", "sys", "ocx", "cpl", "pyd"]
        .iter()
        .any(|e| extension.eq_ignore_ascii_case(e))
    {
        Some(false)
    } else {
        None
    }
}

#[derive(Default)]
pub(crate) struct ArchiveEvidence {
    result: Windows,
    main: Option<Windows>,
    executables: usize,
    partial: bool,
    has_machine_only: bool,
}

impl ArchiveEvidence {
    pub(crate) fn add(&mut self, entry: Windows, executable: bool) {
        self.partial |= entry.payload_status.is_some();
        self.has_machine_only |= entry.architecture_source == Some("pe_machine");
        for &arch in &entry.architectures {
            self.result.observe(arch);
        }
        if executable {
            self.executables += 1;
            self.main = Some(entry);
        }
    }

    pub(crate) fn partial(&mut self) {
        self.partial = true;
    }

    pub(crate) fn finish(mut self, installer: &'static str, out: &mut crate::ScanResult) -> bool {
        if self.result.architectures.is_empty() && self.main.is_none() {
            return false;
        }
        // A unique executable is the only automatic main candidate. DLLs
        // contribute architecture evidence but cannot identify the product.
        if self.executables == 1
            && !self.partial
            && let Some(main) = self.main.take()
        {
            self.result.main_architecture = main.main_architecture;
            self.result.product_name = main.product_name;
            self.result.publisher = main.publisher;
            self.result.version = main.version;
            self.result.dotnet = main.dotnet;
            self.result.subsystem = main.subsystem;
            self.result.machine = main.machine;
        }
        self.result.architecture_source = Some(if self.has_machine_only {
            "archive_pe_machine"
        } else {
            "archive_pe_headers"
        });
        self.result.installer_kind = Some(installer);
        if self.partial {
            self.result.payload_status = Some(UNKNOWN_PAYLOAD);
        }
        self.result.set_result(out);
        true
    }
}

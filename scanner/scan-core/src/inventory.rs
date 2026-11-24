use crate::{Architecture, ReadAt, Result, ScanError, ScanResult, decode::DecodeBudget, macho};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct BinaryInventory {
    pub complete: bool,
    pub incomplete_reason: Option<String>,
    pub binaries: Vec<BundleBinary>,
    pub all_arm64_capable: Option<bool>,
    pub has_x86_64_only: Option<bool>,
    pub x86_64_only: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct BundleBinary {
    pub path: String,
    pub role: &'static str,
    pub architectures: Vec<Architecture>,
}

impl Default for BinaryInventory {
    fn default() -> Self {
        Self {
            complete: true,
            incomplete_reason: None,
            binaries: Vec::new(),
            all_arm64_capable: None,
            has_x86_64_only: None,
            x86_64_only: Vec::new(),
        }
    }
}

impl BinaryInventory {
    pub fn partial(&mut self, reason: impl Into<String>) {
        self.complete = false;
        if self.incomplete_reason.is_none() {
            self.incomplete_reason = Some(reason.into());
        }
    }

    pub(crate) fn record_primary(&mut self, primary: &Result<()>) {
        if let Err(error) = primary
            && !matches!(
                error,
                ScanError::Unsupported("declared executable is a script")
            )
        {
            self.partial(error.to_string());
        }
    }

    pub fn push(&mut self, path: String, role: &'static str, architectures: Vec<Architecture>) {
        if architectures.is_empty() {
            return;
        }
        self.binaries.push(BundleBinary {
            path,
            role,
            architectures,
        });
    }

    pub fn finish(&mut self, main: Option<&str>, architectures: &[Architecture]) {
        if let Some(path) = main {
            self.binaries.retain(|entry| entry.path != path);
            self.push(path.to_owned(), "main", architectures.to_vec());
        }
        self.binaries.sort_unstable_by(|a, b| a.path.cmp(&b.path));
        self.binaries.dedup_by(|a, b| a.path == b.path);
        if self.binaries.iter().any(|binary| {
            binary
                .architectures
                .iter()
                .any(|arch| !arch.header_verified)
        }) {
            self.partial("a Mach-O slice header could not be verified");
        }
        let observed_without_arm =
            self.binaries
                .iter()
                .filter(|binary| {
                    binary.architectures.iter().all(|arch| {
                        arch.header_verified && !matches!(arch.name, "arm64" | "arm64e")
                    })
                })
                .collect::<Vec<_>>();
        self.x86_64_only = observed_without_arm
            .iter()
            .filter(|binary| {
                binary
                    .architectures
                    .iter()
                    .all(|arch| arch.name == "x86_64")
            })
            .map(|binary| binary.path.clone())
            .collect();
        self.all_arm64_capable = if !observed_without_arm.is_empty() {
            Some(false)
        } else {
            (self.complete && !self.binaries.is_empty()).then_some(true)
        };
        self.has_x86_64_only = if self.x86_64_only.is_empty() {
            self.complete.then_some(false)
        } else {
            Some(true)
        };
    }
}

pub fn role(relative: &str) -> Option<&'static str> {
    let inside = relative.strip_prefix("Contents/")?;
    let (top, _) = inside.split_once('/').unwrap_or((inside, ""));
    if !matches!(
        top,
        "MacOS"
            | "Frameworks"
            | "PlugIns"
            | "Plugins"
            | "XPCServices"
            | "Library"
            | "Helpers"
            | "Resources"
            | "SharedSupport"
            | "LaunchServices"
            | "LaunchDaemons"
            | "LaunchAgents"
            | "LoginItems"
            | "Updater"
            | "Sparkle"
            | "jbr"
            | "jre"
            | "jdk"
            | "runtime"
            | "Java"
    ) && !top.ends_with(".app")
        && !top.ends_with(".jdk")
        && !top.ends_with(".bundle")
    {
        return None;
    }
    if inside.contains("Sparkle.framework/") || matches!(top, "Updater" | "Sparkle") {
        return Some("updater");
    }
    if inside.contains(".xpc/") || top == "XPCServices" {
        return Some("xpc_service");
    }
    if inside.contains("/LoginItems/") || top == "LoginItems" {
        return Some("login_item");
    }
    if inside.contains("/LaunchServices/")
        || inside.contains("/LaunchDaemons/")
        || inside.contains("/LaunchAgents/")
        || matches!(top, "LaunchServices" | "LaunchDaemons" | "LaunchAgents")
    {
        return Some("launch_helper");
    }
    if inside.contains(".app/") || top.ends_with(".app") {
        return Some("nested_app");
    }
    Some(match top {
        "Frameworks" if inside.contains(".framework/") => "framework",
        "Frameworks" => "library",
        "PlugIns" | "Plugins" => "plugin",
        "Resources" => "resource",
        "SharedSupport" => "shared_support",
        "jbr" | "jre" | "jdk" | "runtime" | "Java" => "runtime",
        _ if top.ends_with(".jdk") => "runtime",
        _ => "helper",
    })
}

pub(crate) fn relative<'a>(path: &'a str, root: &str) -> Option<&'a str> {
    path.strip_prefix(root)?.strip_prefix('/')
}

/// Inventory follows bundle entry point inspection. Stop optional reads before
/// spending another remote tier on helpers.
pub(crate) struct Allowance {
    remaining_floor: u64,
    decoded_limit: u64,
    entries_left: usize,
}

impl Allowance {
    pub(crate) fn new(source: &impl ReadAt, work: &DecodeBudget<'_>) -> Self {
        let (bytes, decoded, entries) = if work.local() {
            (u64::MAX, u64::MAX, usize::MAX)
        } else if work.strict() {
            (512 * 1024, 8 * 1024 * 1024, 24)
        } else {
            (2 * 1024 * 1024, 32 * 1024 * 1024, 48)
        };
        Self {
            remaining_floor: source.remaining_budget().saturating_sub(bytes),
            decoded_limit: work.used().saturating_add(decoded),
            entries_left: entries,
        }
    }

    pub(crate) fn step(&mut self, source: &impl ReadAt, work: &DecodeBudget<'_>) -> Result<()> {
        work.check_deadline()?;
        if source.remaining_budget() <= self.remaining_floor
            || work.used() >= self.decoded_limit
            || self.entries_left == 0
        {
            return Err(ScanError::WorkLimit("binary inventory budget reached"));
        }
        self.entries_left -= 1;
        Ok(())
    }
}

pub(crate) async fn read(
    source: &mut impl ReadAt,
    path: &str,
    role: &'static str,
    inventory: &mut BinaryInventory,
) -> Result<()> {
    if source.size() < 8 {
        return Ok(());
    }
    let mut header = source.read_at(0, 8).await?;
    if resembles_java(&header) && source.size() >= 12 {
        header.extend(source.read_at(8, 4).await?);
    }
    if !is_macho(&header) {
        return Ok(());
    }
    let mut architectures = Vec::new();
    let result = macho::scan_after_header(source, &header, &mut architectures).await;
    inventory.push(path.to_owned(), role, architectures);
    result
}

fn resembles_java(header: &[u8]) -> bool {
    header.get(..8).is_some_and(|header| {
        header[..4] == [0xca, 0xfe, 0xba, 0xbe]
            && matches!(&header[4..6], [0, 0] | [0xff, 0xff])
            && u16::from_be_bytes(header[6..8].try_into().unwrap()) >= 45
    })
}

pub fn is_macho(header: &[u8]) -> bool {
    // Java class files share the big-endian fat Mach-O magic. A class
    // constant-pool tag at byte 10 is absent from ordinary Mach CPU types.
    macho::kind(header).is_some()
        && !(resembles_java(header)
            && header
                .get(10)
                .is_none_or(|tag| matches!(tag, 1 | 3..=12 | 15..=20)))
}

pub(crate) fn stop(error: &ScanError) -> bool {
    matches!(
        error,
        ScanError::Budget | ScanError::WorkLimit(_) | ScanError::Source(_)
    )
}

pub(crate) fn finalize(out: &mut ScanResult) {
    let Some(root) = &out.bundle_path else { return };
    let inventory = out.inventory.get_or_insert_with(|| {
        let mut inventory = BinaryInventory::default();
        inventory.partial("bundle contents could not be enumerated");
        inventory
    });
    let main = out
        .executable_path
        .as_deref()
        .and_then(|path| relative(path, root));
    inventory.finish(main, &out.architectures);
}

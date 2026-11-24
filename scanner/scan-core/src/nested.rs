use crate::{ReadAt, Result, ScanError, ScanResult, Target, dmg, pkg};

#[derive(Clone, Copy)]
pub(crate) enum Kind {
    Package,
    LegacyPackage,
    DiskImage,
}

impl Kind {
    pub(crate) fn from_path(path: &str) -> Option<Self> {
        let lower = path.to_ascii_lowercase();
        if pkg::package_name(&lower) {
            Some(Self::Package)
        } else if lower.ends_with(".pkg/contents/archive.pax.gz") {
            Some(Self::LegacyPackage)
        } else if lower.ends_with(".dmg") {
            Some(Self::DiskImage)
        } else {
            None
        }
    }
}

pub(crate) async fn scan(
    input: &mut impl ReadAt,
    kind: Kind,
    path: &str,
    target: Target<'_>,
    out: &mut ScanResult,
) -> Result<()> {
    match kind {
        Kind::Package | Kind::LegacyPackage => package(input, kind, path, target, out).await,
        Kind::DiskImage => {
            out.nested_artifacts.push(path.to_owned());
            if input.size() < 512 {
                return Err(ScanError::Invalid("short nested disk image"));
            }
            let trailer = input.read_at(input.size() - 512, 512).await?;
            if !trailer.starts_with(b"koly") {
                return Err(ScanError::Unsupported(
                    "nested disk image lacks a UDIF trailer",
                ));
            }
            dmg::scan(input, &trailer, target, out).await
        }
    }
}

pub(crate) async fn package(
    input: &mut impl ReadAt,
    kind: Kind,
    path: &str,
    target: Target<'_>,
    out: &mut ScanResult,
) -> Result<()> {
    out.nested_artifacts.push(path.to_owned());
    if matches!(kind, Kind::LegacyPackage) {
        pkg::scan_legacy(input, target, out).await
    } else {
        pkg::scan(input, target, out).await
    }
}

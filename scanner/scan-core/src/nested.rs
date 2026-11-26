use crate::{
    ContainerReader, ReadAt, Result, ScanError, ScanResult, Target, decode::DecodeBudget, dmg,
    inflate::Codec, pkg, tar,
};

#[derive(Clone, Copy)]
pub(crate) enum Kind {
    Package,
    LegacyPackage,
    DiskImage,
    Tar(Option<Codec>),
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
        } else if lower.ends_with(".tar.gz") || lower.ends_with(".tgz") {
            Some(Self::Tar(Some(Codec::Gzip)))
        } else if lower.ends_with(".tar.xz") || lower.ends_with(".txz") {
            Some(Self::Tar(Some(Codec::Xz)))
        } else if lower.ends_with(".tar.bz2") || lower.ends_with(".tbz") {
            Some(Self::Tar(Some(Codec::Bzip2)))
        } else if lower.ends_with(".tar.zst") {
            Some(Self::Tar(Some(Codec::Zstd)))
        } else if lower.ends_with(".tar") {
            Some(Self::Tar(None))
        } else {
            None
        }
    }
}

pub(crate) async fn scan(
    input: &mut ContainerReader<'_>,
    kind: Kind,
    path: &str,
    work: &DecodeBudget<'_>,
    target: Target<'_>,
    out: &mut ScanResult,
) -> Result<()> {
    match kind {
        Kind::Package | Kind::LegacyPackage => package(input, kind, path, work, target, out).await,
        Kind::Tar(codec) => {
            out.nested_artifacts.push(path.to_owned());
            if let Some(codec) = codec {
                crate::compressed_tar(input, work, target, out, out.format.unwrap_or("tar"), codec)
                    .await
            } else {
                tar::scan(input, work, target, out).await
            }
        }
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
            dmg::scan(input, work, &trailer, target, out).await
        }
    }
}

pub(crate) async fn package(
    input: &mut ContainerReader<'_>,
    kind: Kind,
    path: &str,
    work: &DecodeBudget<'_>,
    target: Target<'_>,
    out: &mut ScanResult,
) -> Result<()> {
    out.nested_artifacts.push(path.to_owned());
    if matches!(kind, Kind::LegacyPackage) {
        pkg::scan_legacy(input, work, target, out).await
    } else {
        pkg::scan(input, work, target, out).await
    }
}

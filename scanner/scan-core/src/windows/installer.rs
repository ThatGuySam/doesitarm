use super::{
    UNKNOWN_PAYLOAD, Windows,
    pe::Image,
    version::{ResourceType, locate},
};
use crate::{ReadAt, Result, check_range, le32};

pub(super) async fn identify(
    input: &mut impl ReadAt,
    image: &Image,
    dos: &[u8],
    out: &mut Windows,
    from_version: Option<&'static str>,
) -> Result<()> {
    if image.sections.iter().any(|section| {
        &section.name == b".wixburn"
            && section.size >= 48
            && check_range(input.size(), section.offset, u64::from(section.size)).is_ok()
    }) {
        mark(out, "wix_burn");
        return Ok(());
    }
    if let Some(offset) = inno_offset(input, image, dos).await? {
        let magic = input.read_at(offset, 12).await?;
        if magic.starts_with(b"rDlPtS") || magic == b"nS5W7dT\x83\xaa\x1b\x0fj" {
            mark(out, "inno_setup");
            return Ok(());
        }
    }

    let end = image
        .sections
        .iter()
        .filter(|section| section.size != 0)
        .map(|section| section.offset + u64::from(section.size))
        .max()
        .unwrap_or(u64::from(image.headers));
    // Security directory uses file offsets. An Authenticode certificate by
    // itself is not a payload overlay.
    let end_of_overlay = image
        .directory(4)
        .and_then(|(offset, size)| {
            let offset = u64::from(offset);
            (offset >= end && check_range(input.size(), offset, u64::from(size)).is_ok())
                .then_some(offset)
        })
        .unwrap_or(input.size());
    if end_of_overlay.saturating_sub(end) >= 28 {
        let size = (end_of_overlay - end).min(4096) as usize;
        let prefix = input.read_at(end, size).await?;
        if prefix.windows(28).enumerate().any(|(index, header)| {
            (index == 0 || (end + index as u64).is_multiple_of(512))
                && &header[4..20] == b"\xef\xbe\xad\xdeNullsoftInst"
                && le32(header, 20) > 0
                && (28..=end_of_overlay - end - index as u64).contains(&u64::from(le32(header, 24)))
        }) {
            mark(out, "nsis");
            return Ok(());
        }
        const SEVEN_Z: &[u8; 6] = b"7z\xbc\xaf\x27\x1c";
        if prefix.starts_with(SEVEN_Z)
            || prefix
                .strip_prefix(b";")
                .unwrap_or(&prefix)
                .starts_with(b"!@Install@!UTF-8!")
                && prefix.windows(SEVEN_Z.len()).any(|bytes| bytes == SEVEN_Z)
        {
            mark(out, "7z_sfx");
            return Ok(());
        }
        if prefix.starts_with(b"Inno Setup Setup Data (") {
            mark(out, "inno_setup");
            return Ok(());
        }
    }
    if let Some(kind) = from_version {
        mark(out, kind);
    } else if let Some((rva, size)) = image.directory(2)
        && let Some((base, remaining)) = image.region(rva, 16)
        && let Some((rva, length)) = locate(
            input,
            base,
            size.min(remaining),
            ResourceType::Data,
            Some(131),
        )
        .await?
        && length >= 4
        && let Some((offset, _)) = image.region(rva, 4)
        && input.read_at(offset, 4).await? == b"PK\x03\x04"
    {
        mark(out, "squirrel");
    }
    Ok(())
}

async fn inno_offset(input: &mut impl ReadAt, image: &Image, dos: &[u8]) -> Result<Option<u64>> {
    if &dos[48..52] == b"Inno" {
        let pointer = le32(dos, 52);
        if pointer == !le32(dos, 56) && check_range(input.size(), u64::from(pointer), 12).is_ok() {
            return Ok(Some(pointer.into()));
        }
    }
    let Some((rva, size)) = image.directory(2) else {
        return Ok(None);
    };
    let Some((base, remaining)) = image.region(rva, 16) else {
        return Ok(None);
    };
    let Some((rva, _)) = locate(
        input,
        base,
        size.min(remaining),
        ResourceType::Number(10),
        Some(11111),
    )
    .await?
    else {
        return Ok(None);
    };
    Ok(image.region(rva, 12).map(|(offset, _)| offset))
}

fn mark(out: &mut Windows, kind: &'static str) {
    out.bootstrapper_architecture = out.main_architecture.take();
    out.architectures.clear();
    out.architecture_source = None;
    out.installer_kind = Some(kind);
    out.payload_status = Some(UNKNOWN_PAYLOAD);
}

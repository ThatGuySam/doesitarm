use crate::{
    InstallerMetadata, ReadAt, Result, ScanError, ScanResult, Window, be16, be64, check_range,
    cpio, inflate::Inflate,
};
use flate2::read::ZlibDecoder;
use roxmltree::{Document, Node, ParsingOptions};
use std::io::Read;

const MAX_TOC: u64 = 8 * 1024 * 1024;
const MAX_METADATA: u64 = 2 * 1024 * 1024;
const TOC_ERROR: ScanError = ScanError::Invalid("XAR table of contents");

struct Member<'a> {
    name: &'a str,
    encoding: &'a str,
    offset: u64,
    packed: u64,
    expanded: u64,
}

pub(crate) async fn scan(input: &mut impl ReadAt, out: &mut ScanResult) -> Result<()> {
    let head = input.read_at(0, 28).await?;
    let header_size = be16(&head, 4) as u64;
    if header_size < 28 || be16(&head, 6) != 1 {
        return Err(ScanError::Unsupported("XAR header version"));
    }
    let packed = be64(&head, 8);
    let expanded = be64(&head, 16);
    if packed > MAX_TOC || expanded > MAX_TOC {
        return Err(ScanError::Limit("XAR table of contents exceeds 8 MiB"));
    }
    check_range(input.size(), header_size, packed)?;
    let heap = header_size + packed;
    let toc = input.read_at(header_size, packed as usize).await?;
    let toc = expand_zlib(&toc, expanded as usize).map_err(|_| TOC_ERROR)?;
    let doc = parse_xml(&toc).map_err(|_| TOC_ERROR)?;
    let root = named_child(doc.root_element(), "toc").ok_or(TOC_ERROR)?;

    let mut distribution = None;
    let mut package_infos = Vec::new();
    let mut payloads = Vec::new();
    for file in root.descendants().filter(|node| node.has_tag_name("file")) {
        let Some(name) = field(file, "name") else {
            continue;
        };
        if !matches!(name, "Distribution" | "PackageInfo" | "Payload") {
            continue;
        }
        if field(file, "type") != Some("file") {
            continue;
        }
        let Some(data) = named_child(file, "data") else {
            return Err(TOC_ERROR);
        };
        let number = |name| {
            field(data, name)
                .and_then(|n| n.trim().parse::<u64>().ok())
                .ok_or(TOC_ERROR)
        };
        let offset = number("offset")?;
        let packed = number("length")?;
        let expanded = number("size")?;
        check_range(input.size() - heap, offset, packed)?;
        let encoding = named_child(data, "encoding")
            .and_then(|node| node.attribute("style"))
            .unwrap_or("application/octet-stream");
        let member = Member {
            name,
            encoding,
            offset: heap + offset,
            packed,
            expanded,
        };
        match name {
            "Distribution" if distribution.is_none() => distribution = Some(member),
            "PackageInfo" => package_infos.push((file.parent(), member)),
            "Payload" => payloads.push((file.parent(), member)),
            _ => {}
        }
    }

    // Prefer the largest component for single-result scans. Metadata for
    // smaller components can describe unrelated helpers or uninstallers.
    let selected = payloads
        .into_iter()
        .max_by_key(|(_, payload)| payload.packed);
    let package = if let Some((parent, _)) = &selected {
        package_infos
            .iter()
            .find(|(container, _)| container == parent)
    } else {
        package_infos.first()
    };
    if let Some(member) = distribution.as_ref() {
        read_metadata(input, member, out).await?;
    }
    if let Some((_, member)) = package {
        read_metadata(input, member, out).await?;
    }

    let (_, member) = selected.ok_or(ScanError::NotFound("Payload in flat PKG"))?;
    if member.encoding != "application/octet-stream" || member.packed != member.expanded {
        return Err(ScanError::Unsupported("XAR-level compressed PKG Payload"));
    }
    let mut source = Window::new(input, member.offset, member.packed)?;
    if source.size() < 6 {
        return Err(ScanError::Invalid("short PKG Payload"));
    }
    let magic = source.read_at(0, 6).await?;
    if magic.starts_with(b"\x1f\x8b") {
        return cpio::scan(&mut Inflate::gzip(source), out).await;
    }
    if cpio::recognized(&magic) {
        return cpio::scan(&mut source, out).await;
    }
    if magic.starts_with(b"pbzx") {
        return Err(ScanError::Unsupported("PBZX-compressed PKG Payload"));
    }
    Err(ScanError::Unsupported("PKG Payload compression"))
}

async fn read_metadata(
    input: &mut impl ReadAt,
    member: &Member<'_>,
    out: &mut ScanResult,
) -> Result<()> {
    if member.packed > MAX_METADATA || member.expanded > MAX_METADATA {
        return Ok(());
    }
    let data = input.read_at(member.offset, member.packed as usize).await?;
    let data = match member.encoding {
        "application/octet-stream" if member.packed == member.expanded => data,
        "application/x-gzip" => match expand_zlib(&data, member.expanded as usize) {
            Ok(data) => data,
            Err(_) => return Ok(()),
        },
        _ => return Ok(()),
    };
    let Ok(doc) = parse_xml(&data) else {
        return Ok(());
    };
    let root = doc.root_element();
    if member.name == "Distribution" && root.has_tag_name("installer-gui-script") {
        let meta = out.installer.get_or_insert_with(InstallerMetadata::default);
        meta.title = field(root, "title")
            .map(str::trim)
            .filter(|title| !title.is_empty())
            .map(str::to_owned);
        if let Some(arch) =
            named_child(root, "options").and_then(|element| element.attribute("hostArchitectures"))
        {
            meta.host_architectures = arch
                .split(',')
                .map(str::trim)
                .filter(|arch| !arch.is_empty())
                .map(str::to_owned)
                .collect();
        }
        meta.min_macos = named_child(root, "volume-check")
            .and_then(|element| named_child(element, "allowed-os-versions"))
            .and_then(|element| {
                let mut rules = element
                    .children()
                    .filter(|element| element.has_tag_name("os-version"));
                let first = rules.next()?;
                if rules.next().is_none() {
                    first.attribute("min").map(str::to_owned)
                } else {
                    None
                }
            });
    } else if member.name == "PackageInfo" && root.has_tag_name("pkg-info") {
        let meta = out.installer.get_or_insert_with(InstallerMetadata::default);
        meta.package_id = root.attribute("identifier").map(str::to_owned);
        meta.package_version = root.attribute("version").map(str::to_owned);
    }
    Ok(())
}

fn expand_zlib(bytes: &[u8], expanded: usize) -> std::io::Result<Vec<u8>> {
    let mut out = vec![0; expanded];
    let mut reader = ZlibDecoder::new(bytes);
    reader.read_exact(&mut out)?;
    if reader.read(&mut [0])? != 0 {
        return Err(std::io::Error::other(
            "XAR member exceeds declared expanded size",
        ));
    }
    Ok(out)
}

fn parse_xml(bytes: &[u8]) -> Result<Document<'_>> {
    let text = std::str::from_utf8(bytes).map_err(|_| ScanError::Invalid("XAR XML encoding"))?;
    let options = ParsingOptions {
        nodes_limit: 120_000,
        ..Default::default()
    };
    Document::parse_with_options(text, options).map_err(|_| ScanError::Invalid("XAR XML"))
}

fn named_child<'a, 'input>(node: Node<'a, 'input>, tag: &str) -> Option<Node<'a, 'input>> {
    node.children().find(|child| child.has_tag_name(tag))
}

fn field<'a, 'input>(node: Node<'a, 'input>, tag: &str) -> Option<&'a str> {
    named_child(node, tag)?.text()
}

use crate::pbzx::Pbzx;
use crate::{
    InstallerMetadata, ReadAt, Result, ScanError, ScanResult, Window, be16, be64, bom, bundle,
    check_range, cpio, gzip_tail,
    inflate::{Codec, Forward, STREAM_OUTPUT_LIMIT},
    stream_bundle::StreamBundle,
};
use flate2::read::ZlibDecoder;
use roxmltree::{Document, Node, ParsingOptions};
use std::io::Read;

const MAX_TOC: u64 = 8 * 1024 * 1024;
const MAX_METADATA: u64 = 2 * 1024 * 1024;
const MAX_BOM: u64 = 8 * 1024 * 1024;
const PREVIEW_BYTES: u64 = 256 * 1024;
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
    let mut boms = Vec::new();
    for file in root.descendants().filter(|node| node.has_tag_name("file")) {
        let Some(name) = field(file, "name") else {
            continue;
        };
        if !matches!(name, "Distribution" | "PackageInfo" | "Payload" | "Bom") {
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
            "Bom" => boms.push((file.parent(), member)),
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

    let (parent, member) = selected.ok_or(ScanError::NotFound("Payload in flat PKG"))?;
    if member.encoding != "application/octet-stream" || member.packed != member.expanded {
        return Err(ScanError::Unsupported("XAR-level compressed PKG Payload"));
    }
    if member.packed < 6 {
        return Err(ScanError::Invalid("short PKG Payload"));
    }
    let magic = input.read_at(member.offset, 6).await?;
    let kind = if let Some(codec) = Codec::from_magic(&magic) {
        Payload::Compressed(codec)
    } else if magic.starts_with(b"pbzx") {
        Payload::Pbzx
    } else if cpio::recognized(&magic) {
        Payload::Cpio
    } else {
        return Err(ScanError::Unsupported("PKG Payload compression"));
    };

    let mut target = StreamBundle::default();
    let budget = input.remaining_budget();
    if matches!(kind, Payload::Compressed(Codec::Gzip) | Payload::Pbzx)
        && member.packed > budget
        && let Some((_, bom)) = boms.iter().find(|(container, _)| *container == parent)
        && bom.packed <= MAX_BOM
        && bom.expanded <= MAX_BOM
        && budget > 2 * PREVIEW_BYTES + bom.packed + gzip_tail::TAIL_BYTES
    {
        let mut preview = ScanResult::new(out.total_size);
        let source = Preview::new(Window::new(input, member.offset, member.packed)?);
        let result = inspect_payload(source, kind, StreamBundle::default(), &mut preview).await;
        if !matches!(result, Err(ScanError::Budget)) {
            preview.installer = out.installer.take();
            preview.format = out.format;
            *out = preview;
            return result;
        }
        // There is no reason to fetch a detached plist if the prefix already
        // found it and is spending its remaining input on the executable.
        if preview.executable_name.is_none()
            && let Some((path, provenance)) = recover_target(input, kind, &member, bom, out).await
        {
            target = StreamBundle::with_target(path);
            out.bundle_metadata_source = Some(provenance);
        }
    }

    let source = Window::new(input, member.offset, member.packed)?;
    inspect_payload(source, kind, target, out).await
}

#[derive(Clone, Copy)]
enum Payload {
    Cpio,
    Compressed(Codec),
    Pbzx,
}

async fn inspect_payload(
    mut source: impl ReadAt,
    kind: Payload,
    target: StreamBundle,
    out: &mut ScanResult,
) -> Result<()> {
    match kind {
        Payload::Cpio => cpio::scan(&mut source, out).await,
        Payload::Compressed(codec) => {
            cpio::scan_with(
                &mut Forward::new(source, STREAM_OUTPUT_LIMIT, codec),
                target,
                out,
            )
            .await
        }
        Payload::Pbzx => cpio::scan_with(&mut Pbzx::open(source).await?, target, out).await,
    }
}

async fn recover_target(
    input: &mut impl ReadAt,
    kind: Payload,
    payload: &Member<'_>,
    bom: &Member<'_>,
    out: &mut ScanResult,
) -> Option<(String, &'static str)> {
    let bom = read_small_member(input, bom, MAX_BOM).await.ok()??;
    let expected = bom::late_plist(&bom)?;
    let mut source = Window::new(input, payload.offset, payload.packed).ok()?;
    let (bytes, evidence) = match kind {
        Payload::Compressed(Codec::Gzip) => {
            let span = source.size().min(gzip_tail::TAIL_BYTES);
            let tail = source
                .read_at(source.size() - span, span as usize)
                .await
                .ok()?;
            (
                gzip_tail::recover(&tail, &expected)?,
                "bom_verified_gzip_cpio_tail",
            )
        }
        Payload::Pbzx => {
            let (start, tail) = Pbzx::open(source).await.ok()?.tail().await.ok()??;
            let (_, bytes) = cpio::tail_plist(&tail, start, &expected)?;
            (bytes.to_vec(), "bom_verified_pbzx_cpio_tail")
        }
        Payload::Cpio | Payload::Compressed(_) => return None,
    };
    let root = bundle::outer_plist(&expected.path)?;
    let mut bundle = ScanResult::new(out.total_size);
    let target = bundle::apply_plist(&bytes, root, &mut bundle).ok()?;
    bundle.installer = out.installer.take();
    bundle.format = out.format;
    *out = bundle;
    Some((target, evidence))
}

struct Preview<S> {
    source: S,
    remaining: u64,
}

impl<S> Preview<S> {
    fn new(source: S) -> Self {
        Self {
            source,
            remaining: PREVIEW_BYTES,
        }
    }
}

impl<S: ReadAt> ReadAt for Preview<S> {
    fn size(&self) -> u64 {
        self.source.size()
    }

    fn remaining_budget(&self) -> u64 {
        self.remaining.min(self.source.remaining_budget())
    }

    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>> {
        if len as u64 > self.remaining_budget() {
            return Err(ScanError::Budget);
        }
        let bytes = self.source.read_at(offset, len).await?;
        self.remaining -= len as u64;
        Ok(bytes)
    }
}

async fn read_metadata(
    input: &mut impl ReadAt,
    member: &Member<'_>,
    out: &mut ScanResult,
) -> Result<()> {
    let Some(data) = read_small_member(input, member, MAX_METADATA).await? else {
        return Ok(());
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

async fn read_small_member(
    input: &mut impl ReadAt,
    member: &Member<'_>,
    limit: u64,
) -> Result<Option<Vec<u8>>> {
    if member.packed > limit || member.expanded > limit {
        return Ok(None);
    }
    let data = input.read_at(member.offset, member.packed as usize).await?;
    Ok(match member.encoding {
        "application/octet-stream" if member.packed == member.expanded => Some(data),
        "application/x-gzip" => expand_zlib(&data, member.expanded as usize).ok(),
        _ => None,
    })
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

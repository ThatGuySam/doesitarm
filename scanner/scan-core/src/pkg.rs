use crate::pbzx::Pbzx;
use crate::{
    ContainerReader, InstallerMetadata, ReadAt, Result, ScanError, ScanResult, Target, Window,
    be16, be64, bom, bundle, check_range, cpio,
    decode::{self, DecodeBudget},
    gzip_tail,
    inflate::{Codec, Forward},
    stream_bundle::StreamBundle,
};
use roxmltree::{Document, Node, ParsingOptions};
use std::{future::Future, pin::Pin, rc::Rc};

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

#[derive(Default)]
struct Segment {
    offset: u64,
    size: u64,
    components: Vec<Rc<str>>,
}

struct ScriptArchive {
    offset: u64,
    size: u64,
    path: String,
    parents: Vec<String>,
}

pub(crate) async fn scan(
    input: &mut ContainerReader<'_>,
    work: &DecodeBudget<'_>,
    selection: Target<'_>,
    out: &mut ScanResult,
) -> Result<()> {
    let mut input = PackageReader(input);
    let mut scripts = Vec::new();
    let primary = scan_packages(&mut input, work, selection, out, Some(&mut scripts)).await;
    if !matches!(primary, Err(ScanError::NotFound(_))) || out.bundle_path.is_some() {
        return primary;
    }
    for archive in scripts {
        let mut result = out.subresult();
        result.format = out.format;
        result.installer.clone_from(&out.installer);
        result.nested_artifacts = archive.parents.clone();
        let attempt = scan_script_archive(&mut input, work, selection, &mut result, archive).await;
        if attempt.is_ok() || attempt.as_ref().is_err_and(crate::inventory::stop) {
            *out = result;
            return attempt;
        }
    }
    primary
}

async fn scan_packages(
    input: &mut PackageReader<'_>,
    work: &DecodeBudget<'_>,
    selection: Target<'_>,
    out: &mut ScanResult,
    mut scripts: Option<&mut Vec<ScriptArchive>>,
) -> Result<()> {
    let mut pending = vec![Segment {
        size: input.size(),
        components: out
            .nested_artifacts
            .iter()
            .map(|path| Rc::from(path.as_str()))
            .collect(),
        ..Segment::default()
    }];
    let mut first_failure = None;
    let mut attempts = 0;
    while let Some(segment) = pending.pop() {
        work.check_deadline()?;
        if work.strict() {
            if attempts == 32 {
                break;
            }
            attempts += 1;
        }
        let mut candidate = out.subresult();
        candidate.format = out.format;
        candidate.nested_artifacts = segment.components.iter().map(ToString::to_string).collect();
        match inspect_xar(
            input,
            &segment,
            &mut pending,
            work,
            selection,
            &mut candidate,
            scripts.as_deref_mut(),
        )
        .await
        {
            result @ (Ok(())
            | Err(ScanError::Budget | ScanError::WorkLimit(_) | ScanError::Source(_))) => {
                *out = candidate;
                return result;
            }
            Err(error) => {
                // Prefer the deeper package evidence when the outer package
                // was an XAR wrapper with no local payload.
                if first_failure.as_ref().is_none_or(
                    |(before, result): &(ScanError, ScanResult)| {
                        matches!(before, ScanError::NotFound("Payload in flat PKG"))
                            && result.nested_artifacts.len() < candidate.nested_artifacts.len()
                    },
                ) {
                    first_failure = Some((error, candidate));
                }
            }
        }
    }
    if let Some((error, result)) = first_failure {
        *out = result;
        return Err(error);
    }
    Err(ScanError::NotFound("Payload in flat PKG"))
}

async fn inspect_xar(
    input: &mut impl ReadAt,
    segment: &Segment,
    pending: &mut Vec<Segment>,
    work: &DecodeBudget<'_>,
    selection: Target<'_>,
    out: &mut ScanResult,
    mut script_archives: Option<&mut Vec<ScriptArchive>>,
) -> Result<()> {
    let (start, size) = (segment.offset, segment.size);
    check_range(size, 0, 28)?;
    let head = input.read_at(start, 28).await?;
    if &head[..4] != b"xar!" {
        return Err(ScanError::Unsupported("nested PKG is not flat XAR"));
    }
    let header_size = be16(&head, 4) as u64;
    if header_size < 28 || be16(&head, 6) != 1 {
        return Err(ScanError::Unsupported("XAR header version"));
    }
    let packed = be64(&head, 8);
    let expanded = be64(&head, 16);
    if packed > MAX_TOC || expanded > MAX_TOC {
        return Err(ScanError::Limit("XAR table of contents exceeds 8 MiB"));
    }
    check_range(size, header_size, packed)?;
    let heap = header_size + packed;
    work.check_chunk(packed, expanded)?;
    let toc = input.read_at(start + header_size, packed as usize).await?;
    work.start_chunk(expanded)?;
    let toc = decode::zlib(&toc, expanded as usize, TOC_ERROR, work)?;
    let doc = parse_xml(&toc).map_err(|_| TOC_ERROR)?;
    let root = named_child(doc.root_element(), "toc").ok_or(TOC_ERROR)?;

    let mut distribution = None;
    let mut package_infos = Vec::new();
    let mut payloads = Vec::new();
    let mut boms = Vec::new();
    let mut scripts = Vec::new();
    let mut embedded = Vec::new();
    for file in root.descendants().filter(|node| node.has_tag_name("file")) {
        let Some(name) = field(file, "name") else {
            continue;
        };
        let is_pkg = package_name(name);
        if !matches!(
            name,
            "Distribution" | "PackageInfo" | "Payload" | "Bom" | "Scripts"
        ) && !is_pkg
        {
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
        check_range(size - heap, offset, packed)?;
        let encoding = named_child(data, "encoding")
            .and_then(|node| node.attribute("style"))
            .unwrap_or("application/octet-stream");
        let member = Member {
            name,
            encoding,
            offset: start + heap + offset,
            packed,
            expanded,
        };
        match name {
            "Distribution" if distribution.is_none() => distribution = Some(member),
            "PackageInfo" => package_infos.push((file.parent(), member)),
            "Payload" => payloads.push((file.parent(), member)),
            "Bom" => boms.push((file.parent(), member)),
            "Scripts" => scripts.push((file.parent(), member)),
            _ if is_pkg => embedded.push(member),
            _ => {}
        }
    }

    let max_components = if work.strict() { 8 } else { usize::MAX };
    if !embedded.is_empty() && out.nested_artifacts.len() < 4 {
        embedded.sort_by_key(|member| member.packed);
        let can_scan = embedded
            .iter()
            .rev()
            .take(max_components)
            .filter(|member| {
                member.encoding == "application/octet-stream" && member.packed == member.expanded
            })
            .collect::<Vec<_>>();
        for member in can_scan.iter().rev() {
            let mut components = segment.components.clone();
            components.push(Rc::from(member.name));
            pending.push(Segment {
                offset: member.offset,
                size: member.packed,
                components,
            });
        }
    }

    if let Some(member) = distribution.as_ref() {
        read_metadata(input, member, work, out).await?;
    }
    if payloads.is_empty() {
        if let Some((_, member)) = package_infos.first() {
            read_metadata(input, member, work, out).await?;
        }
        if out
            .installer
            .as_ref()
            .is_some_and(|meta| !meta.remote_components.is_empty())
        {
            return Err(ScanError::Unsupported(
                "installer Distribution references remote package components",
            ));
        }
        if !embedded.is_empty()
            && pending
                .iter()
                .all(|segment| segment.components.len() <= out.nested_artifacts.len())
        {
            out.nested_artifacts
                .push(embedded.last().unwrap().name.to_owned());
            return Err(ScanError::Unsupported(
                "nested PKG encoding or nesting depth",
            ));
        }
        return Err(ScanError::NotFound("Payload in flat PKG"));
    }

    payloads.sort_by_key(|(_, payload)| std::cmp::Reverse(payload.packed));
    let mut first_miss = None;
    let installer = out.installer.clone();
    for (parent, member) in payloads.into_iter().take(max_components) {
        let mut result = out.subresult();
        result.format = out.format;
        result.nested_artifacts = out.nested_artifacts.clone();
        result.installer.clone_from(&installer);
        if let Some((_, package)) = package_infos
            .iter()
            .find(|(container, _)| *container == parent)
        {
            read_metadata(input, package, work, &mut result).await?;
        }
        let bom = boms
            .iter()
            .find(|(container, _)| *container == parent)
            .map(|(_, member)| member);
        let outcome = scan_payload(input, &member, bom, work, selection, &mut result).await;
        if matches!(outcome, Err(ScanError::NotFound(_)))
            && result.bundle_path.is_none()
            && result.executable_path.is_none()
            && result
                .installer
                .as_ref()
                .is_some_and(|meta| meta.script_entries.iter().any(|path| path == "postinstall"))
            && let Some(archives) = &mut script_archives
            && let Some((_, script)) = scripts.iter().find(|(container, _)| *container == parent)
            && script.encoding == "application/octet-stream"
            && script.packed == script.expanded
        {
            let path = parent
                .and_then(|parent| field(parent, "name"))
                .and_then(bundle::archive_path)
                .map_or_else(
                    || "Scripts".to_owned(),
                    |parent| format!("{parent}/Scripts"),
                );
            archives.push(ScriptArchive {
                offset: script.offset,
                size: script.packed,
                path,
                parents: result.nested_artifacts.clone(),
            });
        }
        match outcome {
            outcome @ (Ok(())
            | Err(ScanError::Budget | ScanError::WorkLimit(_) | ScanError::Source(_))) => {
                *out = result;
                return outcome;
            }
            Err(error) if first_miss.is_none() => first_miss = Some((error, result)),
            Err(_) => (),
        }
    }
    let (error, result) = first_miss.unwrap();
    *out = result;
    Err(error)
}

async fn scan_script_archive(
    input: &mut PackageReader<'_>,
    work: &DecodeBudget<'_>,
    selection: Target<'_>,
    out: &mut ScanResult,
    archive: ScriptArchive,
) -> Result<()> {
    let missing = ScanError::NotFound("single application package in installer Scripts");
    let mut source = Window::new(input, archive.offset, archive.size)?;
    if source.size() < 2 || source.read_at(0, 2).await? != b"\x1f\x8b" {
        return Err(missing);
    }
    let mut decoded = Forward::new(source, work.stream_limit(), Codec::Gzip, work)?;
    out.nested_artifacts.push(archive.path.clone());
    let (path, offset, size) = cpio::script_package(&mut decoded, work)
        .await?
        .ok_or(missing)?;
    // Keep only the decoder window in memory. The inner XAR can visit its
    // metadata out of order, so a backward read restarts the gzip decoder.
    let mut decoded = ReplayedScripts(decoded);
    let mut package = Window::new(&mut decoded, offset, size)?;
    *out.nested_artifacts.last_mut().unwrap() = format!("{}/{path}", archive.path);
    scan_packages(&mut PackageReader(&mut package), work, selection, out, None).await
}

struct ReplayedScripts<'a, S>(Forward<'a, S>);

impl<S: ReadAt> ReadAt for ReplayedScripts<'_, S> {
    fn size(&self) -> u64 {
        self.0.size()
    }

    fn remaining_budget(&self) -> u64 {
        self.0.remaining_budget()
    }

    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>> {
        self.0.rewind_for(offset)?;
        self.0.read_at(offset, len).await
    }
}

// Share the package parser between direct, nested and replayed script readers.
// The host interface stays generic and retains the same byte meter.
struct PackageReader<'a>(&'a mut dyn ErasedReadAt);

type RangeRead<'a> = Pin<Box<dyn Future<Output = Result<Vec<u8>>> + 'a>>;

trait ErasedReadAt {
    fn source_size(&self) -> u64;
    fn source_budget(&self) -> u64;
    fn read_boxed(&mut self, offset: u64, len: usize) -> RangeRead<'_>;
}

impl<S: ReadAt> ErasedReadAt for S {
    fn source_size(&self) -> u64 {
        self.size()
    }

    fn source_budget(&self) -> u64 {
        self.remaining_budget()
    }

    fn read_boxed(&mut self, offset: u64, len: usize) -> RangeRead<'_> {
        Box::pin(self.read_at(offset, len))
    }
}

impl ReadAt for PackageReader<'_> {
    fn size(&self) -> u64 {
        self.0.source_size()
    }

    fn remaining_budget(&self) -> u64 {
        self.0.source_budget()
    }

    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>> {
        self.0.read_boxed(offset, len).await
    }
}

pub(crate) fn package_name(path: &str) -> bool {
    path.rsplit_once('.').is_some_and(|(_, extension)| {
        extension.eq_ignore_ascii_case("pkg") || extension.eq_ignore_ascii_case("mpkg")
    })
}

/// Legacy bundle packages ship one gzipped Archive.pax member. Its decoded
/// payload can use tar or CPIO framing depending on the package producer.
pub(crate) async fn scan_legacy(
    input: &mut impl ReadAt,
    work: &DecodeBudget<'_>,
    target: Target<'_>,
    out: &mut ScanResult,
) -> Result<()> {
    let size = input.size();
    let source = Window::new(input, 0, size)?;
    let mut stream = Forward::new(source, work.stream_limit(), Codec::Gzip, work)?;
    let prefix = stream.read_at(0, 6).await?;
    let is_cpio = cpio::recognized(&prefix);
    let mut source = Replay { prefix, stream };
    if is_cpio {
        return cpio::scan_with(&mut source, work, StreamBundle::new(target), out).await;
    }
    crate::tar::scan(
        &mut source,
        work,
        target,
        out,
        crate::tar::PriorRuntime::Ignore,
    )
    .await
}

struct Replay<S> {
    prefix: Vec<u8>,
    stream: S,
}

impl<S: ReadAt> ReadAt for Replay<S> {
    fn size(&self) -> u64 {
        self.stream.size()
    }

    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>> {
        if offset >= self.prefix.len() as u64 {
            return self.stream.read_at(offset, len).await;
        }
        let at = offset as usize;
        let count = len.min(self.prefix.len() - at);
        let mut bytes = self.prefix[at..at + count].to_vec();
        if count < len {
            bytes.extend(
                self.stream
                    .read_at(offset + count as u64, len - count)
                    .await?,
            );
        }
        Ok(bytes)
    }
}

async fn scan_payload(
    input: &mut impl ReadAt,
    member: &Member<'_>,
    bom: Option<&Member<'_>>,
    work: &DecodeBudget<'_>,
    selection: Target<'_>,
    out: &mut ScanResult,
) -> Result<()> {
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

    let install = out.installer.as_ref();
    let mount = install
        .and_then(|meta| meta.install_location.as_deref())
        .and_then(bundle_mount)
        .map(str::to_owned);
    let selected_product = match (selection, mount.as_deref()) {
        (Target::Auto, Some(root)) if !root.ends_with(".app") => Some(root),
        (Target::Auto, None) => install.and_then(|meta| product_bundle(&meta.payload_bundles)),
        _ => None,
    }
    .map(str::to_owned);
    let selection = selected_product
        .as_deref()
        .map_or(selection, Target::Bundle);
    let mut target = StreamBundle::new(selection).with_mount(mount.clone());
    let budget = input.remaining_budget();
    if !matches!(selection, Target::Executable(_))
        && matches!(kind, Payload::Compressed(Codec::Gzip) | Payload::Pbzx)
        && member.packed > budget
        && let Some(bom) = bom
        && bom.packed <= MAX_BOM
        && bom.expanded <= MAX_BOM
        && budget > 2 * PREVIEW_BYTES + bom.packed + gzip_tail::TAIL_BYTES
    {
        let mut preview = out.subresult();
        let mut source = Preview::new(Window::new(input, member.offset, member.packed)?);
        let result = inspect_payload(
            ContainerReader::new(&mut source),
            kind,
            work,
            StreamBundle::new(selection).with_mount(mount.clone()),
            &mut preview,
        )
        .await;
        if !matches!(result, Err(ScanError::Budget)) {
            preview.installer = out.installer.take();
            preview.format = out.format;
            preview.nested_artifacts = std::mem::take(&mut out.nested_artifacts);
            *out = preview;
            return result;
        }
        // There is no reason to fetch a detached plist if the prefix already
        // found it and is spending its remaining input on the executable.
        if preview.executable_name.is_none()
            && let Some((path, provenance)) = recover_target(
                input,
                kind,
                member,
                bom,
                work,
                (selection, mount.as_deref()),
                out,
            )
            .await
        {
            target = target.with_target(path);
            out.bundle_metadata_source = Some(provenance);
        }
    }

    let mut source = Window::new(input, member.offset, member.packed)?;
    inspect_payload(ContainerReader::new(&mut source), kind, work, target, out).await
}

#[derive(Clone, Copy)]
enum Payload {
    Cpio,
    Compressed(Codec),
    Pbzx,
}

async fn inspect_payload(
    mut source: ContainerReader<'_>,
    kind: Payload,
    work: &DecodeBudget<'_>,
    target: StreamBundle<'_>,
    out: &mut ScanResult,
) -> Result<()> {
    match kind {
        Payload::Cpio => cpio::scan_with(&mut source, work, target, out).await,
        Payload::Compressed(codec) => {
            cpio::scan_with(
                &mut Forward::new(source, work.stream_limit(), codec, work)?,
                work,
                target,
                out,
            )
            .await
        }
        Payload::Pbzx => {
            cpio::scan_with(&mut Pbzx::open(source, work).await?, work, target, out).await
        }
    }
}

async fn recover_target(
    input: &mut impl ReadAt,
    kind: Payload,
    payload: &Member<'_>,
    bom: &Member<'_>,
    work: &DecodeBudget<'_>,
    (selection, mount): (Target<'_>, Option<&str>),
    out: &mut ScanResult,
) -> Option<(String, &'static str)> {
    let bom = read_small_member(input, bom, MAX_BOM, work).await.ok()??;
    let expected = bom::late_plist(&bom, |path| {
        if let Some(root) = mount {
            bundle::selected_plist(&format!("{root}/{path}"), selection).is_some()
        } else {
            bundle::selected_plist(path, selection).is_some()
        }
    })?;
    let mut source = Window::new(input, payload.offset, payload.packed).ok()?;
    let (bytes, evidence) = match kind {
        Payload::Compressed(Codec::Gzip) => {
            let span = source.size().min(gzip_tail::TAIL_BYTES);
            let tail = source
                .read_at(source.size() - span, span as usize)
                .await
                .ok()?;
            (
                gzip_tail::recover(&tail, &expected, work)?,
                "bom_verified_gzip_cpio_tail",
            )
        }
        Payload::Pbzx => {
            let (start, tail) = Pbzx::open(source, work).await.ok()?.tail().await.ok()??;
            let (_, bytes) = cpio::tail_plist(&tail, start, &expected)?;
            (bytes.to_vec(), "bom_verified_pbzx_cpio_tail")
        }
        Payload::Cpio | Payload::Compressed(_) => return None,
    };
    let mounted_path;
    let path = if let Some(root) = mount {
        mounted_path = format!("{root}/{}", expected.path);
        &mounted_path
    } else {
        &expected.path
    };
    let root = bundle::selected_plist(path, selection)?;
    let mut bundle = out.subresult();
    let target = bundle::apply_plist(&bytes, root, &mut bundle, true).ok()?;
    bundle.installer = out.installer.take();
    bundle.format = out.format;
    bundle.nested_artifacts = std::mem::take(&mut out.nested_artifacts);
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

fn product_bundle(bundles: &[String]) -> Option<&str> {
    let mut applications = bundles.iter().filter(|path| {
        path.strip_prefix("Applications/")
            .is_some_and(|name| name.ends_with(".app") && !name.contains('/'))
    });
    if let Some(app) = applications.next() {
        return applications.next().is_none().then_some(app);
    }
    if bundles
        .iter()
        .any(|path| bundle::installed_bundle_kind(path) == Some("app"))
    {
        return None;
    }
    let mut products = bundles.iter().filter(|path| {
        matches!(
            bundle::installed_bundle_kind(path),
            Some("audio_plugin" | "driver" | "runtime")
        )
    });
    let product = products.next()?;
    products.next().is_none().then_some(product)
}

fn bundle_mount(install_location: &str) -> Option<&str> {
    let path = install_location.strip_prefix('/')?.trim_end_matches('/');
    bundle::archive_path(path).filter(|path| bundle::installed_bundle_kind(path).is_some())
}

async fn read_metadata(
    input: &mut impl ReadAt,
    member: &Member<'_>,
    work: &DecodeBudget<'_>,
    out: &mut ScanResult,
) -> Result<()> {
    let Some(data) = read_small_member(input, member, MAX_METADATA, work).await? else {
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
        meta.remote_components.extend(
            root.descendants()
                .filter(|node| node.has_tag_name("pkg-ref"))
                .filter_map(|node| node.text().map(str::trim))
                .filter(|text| text.starts_with("https://") || text.starts_with("http://"))
                .take(16)
                .map(|url| {
                    url.split('?')
                        .next()
                        .unwrap_or_default()
                        .chars()
                        .take(256)
                        .collect()
                }),
        );
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
        meta.install_location = root
            .attribute("install-location")
            .filter(|location| location.starts_with('/') && location.len() <= 4096)
            .map(str::to_owned);
        meta.payload_bundles = root
            .children()
            .chain(
                named_child(root, "bundle-version")
                    .into_iter()
                    .flat_map(|version| version.children()),
            )
            .filter(|node| node.has_tag_name("bundle"))
            .filter_map(|node| bundle::archive_path(node.attribute("path")?))
            .filter(|path| path.len() <= 4096)
            .take(128)
            .map(str::to_owned)
            .collect();
        meta.script_entries = named_child(root, "scripts")
            .into_iter()
            .flat_map(|scripts| scripts.children().filter_map(|node| node.attribute("file")))
            .filter_map(bundle::archive_path)
            .filter(|path| path.len() <= 4096)
            .take(32)
            .map(str::to_owned)
            .collect();
    }
    Ok(())
}

async fn read_small_member(
    input: &mut impl ReadAt,
    member: &Member<'_>,
    limit: u64,
    work: &DecodeBudget<'_>,
) -> Result<Option<Vec<u8>>> {
    if member.packed > limit || member.expanded > limit {
        return Ok(None);
    }
    let compressed = matches!(
        member.encoding,
        "application/x-gzip" | "application/x-bzip2"
    );
    if compressed {
        work.check_chunk(member.packed, member.expanded)?;
    }
    let data = input.read_at(member.offset, member.packed as usize).await?;
    if compressed {
        work.start_chunk(member.expanded)?;
    }
    let size = member.expanded as usize;
    Ok(match member.encoding {
        "application/octet-stream" if member.packed == member.expanded => Some(data),
        "application/x-gzip" => optional_metadata(decode::zlib(&data, size, TOC_ERROR, work))?,
        "application/x-bzip2" => optional_metadata(decode::exact(
            &mut bzip2::read::BzDecoder::new(data.as_slice()),
            size,
            TOC_ERROR,
            work,
        ))?,
        _ => None,
    })
}

fn optional_metadata(result: Result<Vec<u8>>) -> Result<Option<Vec<u8>>> {
    match result {
        Ok(data) => Ok(Some(data)),
        Err(ScanError::Invalid(_)) => Ok(None),
        Err(error) => Err(error),
    }
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

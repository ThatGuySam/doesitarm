use super::{Windows, label};
use crate::{Result, ScanError};
use roxmltree::{Document, Node, ParsingOptions};

const BAD_MANIFEST: ScanError = ScanError::Invalid("Appx manifest");
pub(crate) const MAX_MANIFEST: u64 = 256 * 1024;

pub(crate) fn manifest(raw: &[u8], is_bundle: bool, out: &mut Windows) -> Result<()> {
    let utf16;
    let text = if raw.starts_with(b"\xff\xfe") || raw.starts_with(b"\xfe\xff") {
        if raw.len() % 2 != 0 {
            return Err(BAD_MANIFEST);
        }
        let little = raw[0] == 0xff;
        let units: Vec<_> = raw[2..]
            .chunks_exact(2)
            .map(|s| {
                let pair = [s[0], s[1]];
                if little {
                    u16::from_le_bytes(pair)
                } else {
                    u16::from_be_bytes(pair)
                }
            })
            .collect();
        utf16 = String::from_utf16(&units).map_err(|_| BAD_MANIFEST)?;
        &utf16
    } else {
        std::str::from_utf8(raw.strip_prefix(b"\xef\xbb\xbf").unwrap_or(raw))
            .map_err(|_| BAD_MANIFEST)?
    };
    let tree = Document::parse_with_options(
        text,
        ParsingOptions {
            allow_dtd: false,
            nodes_limit: 8192,
            ..ParsingOptions::default()
        },
    )
    .map_err(|_| BAD_MANIFEST)?;
    let root = tree.root_element();
    let namespace = root.tag_name().namespace().unwrap_or("");
    if is_bundle {
        if !named(root, "Bundle") || !namespace.starts_with("http://schemas.microsoft.com/appx/") {
            return Err(BAD_MANIFEST);
        }
    } else if !named(root, "Package")
        || !namespace.starts_with("http://schemas.microsoft.com/appx/")
    {
        return Err(BAD_MANIFEST);
    }
    let identity = child(root, "Identity").ok_or(BAD_MANIFEST)?;
    out.installer_kind = Some(if is_bundle {
        "msix/appxbundle"
    } else {
        "msix/appx"
    });
    out.product_name = identity.attribute("Name").and_then(label);
    out.version = identity.attribute("Version").and_then(label);
    out.publisher = identity.attribute("Publisher").and_then(label);

    if is_bundle {
        let packages = child(root, "Packages").ok_or(BAD_MANIFEST)?;
        for package in packages
            .children()
            .filter(|&n| same_ns(packages, n) && named(n, "Package"))
        {
            if package.attribute("Type") == Some("application")
                && let Some(arch) = architecture(package.attribute("Architecture"))
            {
                out.observe(arch);
            }
        }
    } else {
        if let Some(properties) = child(root, "Properties") {
            if let Some(display) = display_name(properties, "DisplayName") {
                out.product_name = Some(display);
            }
            if let Some(publisher) = display_name(properties, "PublisherDisplayName") {
                out.publisher = Some(publisher);
            }
        }
        if let Some(arch) = architecture(identity.attribute("ProcessorArchitecture")) {
            out.observe(arch);
        }
    }
    if let [arch] = out.architectures.as_slice() {
        out.main_architecture = Some(arch);
    }
    if !out.architectures.is_empty() {
        out.architecture_source = Some("appx_manifest");
    }
    Ok(())
}

fn architecture(text: Option<&str>) -> Option<&'static str> {
    match text?.to_ascii_lowercase().as_str() {
        "x86" => Some("x86"),
        "x64" => Some("x64"),
        "arm64" => Some("arm64"),
        "arm" => Some("arm32"),
        "neutral" => Some("neutral"),
        _ => None,
    }
}

fn named(node: Node<'_, '_>, name: &str) -> bool {
    node.is_element() && node.tag_name().name() == name
}

fn same_ns(parent: Node<'_, '_>, node: Node<'_, '_>) -> bool {
    parent.tag_name().namespace() == node.tag_name().namespace()
}

fn child<'a, 'd>(root: Node<'a, 'd>, name: &str) -> Option<Node<'a, 'd>> {
    root.children()
        .find(|&node| named(node, name) && same_ns(root, node))
}

fn display_name(root: Node<'_, '_>, name: &str) -> Option<String> {
    let value = child(root, name)?.text()?.trim();
    if value.to_ascii_lowercase().starts_with("ms-resource:") {
        return None;
    }
    label(value)
}

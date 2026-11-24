"""Construct a flat XAR package containing Distribution, PackageInfo and CPIO."""
import gzip
import lzma
import plistlib
import zlib
from struct import pack
from xml.etree.ElementTree import Element, SubElement, tostring

DIST = b"""<installer-gui-script><title>Fixture Installer</title>
<options hostArchitectures="x86_64,arm64"/>
<volume-check><allowed-os-versions><os-version min="11.0"/>
</allowed-os-versions></volume-check></installer-gui-script>"""
INFO = b'<pkg-info identifier="org.doesitarm.fixture-installer" version="5"/>'


def cpio(files, *, odc):
    output = bytearray()
    for index, (name, data) in enumerate([*files, ("TRAILER!!!", b"")], 1):
        name = name.encode() + b"\0"
        if odc:
            header = "070707" + "".join(
                f"{field:06o}" for field in [0, index, 0o100755, 0, 0, 1, 0]
            ) + f"{0:011o}{len(name):06o}{len(data):011o}"
        else:
            header = "070701" + "".join(
                f"{field:08x}" for field in [
                    index, 0o100755, 0, 0, 1, 0, len(data), 0, 0, 0, 0, len(name), 0
                ]
            )
        output.extend(header.encode())
        output.extend(name)
        if not odc:
            output.extend(b"\0" * (-len(output) % 4))
        output.extend(data)
        if not odc:
            output.extend(b"\0" * (-len(output) % 4))
    return output


def pkg_fixture(path, info_path, bin_path, metadata, executable, *, odc=False, pbzx=False):
    plist = plistlib.dumps(metadata)
    files = [(bin_path, executable), (info_path, plist)] if odc else [(info_path, plist), (bin_path, executable)]
    if pbzx:
        files.insert(1, ("unused", bytes(range(256)) * 64))
    archive = cpio(files, odc=odc)
    if pbzx:
        payload = encode_pbzx(archive)
    else:
        payload = bytes(archive) if odc else gzip.compress(archive, mtime=0)

    root = Element("xar")
    toc = SubElement(root, "toc")
    package = SubElement(toc, "file", id="1")
    SubElement(package, "name").text = "Fixture.pkg"
    SubElement(package, "type").text = "directory"
    heap = bytearray()
    for index, (parent, name, data, compressed) in enumerate([
        (toc, "Distribution", DIST, False),
        (package, "PackageInfo", INFO, True),
        (package, "Payload", payload, False),
    ], 2):
        entry = SubElement(parent, "file", id=str(index))
        SubElement(entry, "name").text = name
        SubElement(entry, "type").text = "file"
        packed = zlib.compress(data) if compressed else data
        member = SubElement(entry, "data")
        SubElement(member, "offset").text = str(len(heap))
        SubElement(member, "length").text = str(len(packed))
        SubElement(member, "size").text = str(len(data))
        SubElement(member, "encoding", style="application/x-gzip" if compressed else "application/octet-stream")
        heap.extend(packed)
    toc_data = tostring(root, encoding="utf-8", xml_declaration=True)
    compressed = zlib.compress(toc_data)
    header = pack(">4sHHQQI", b"xar!", 28, 1, len(compressed), len(toc_data), 0)
    path.write_bytes(header + compressed + heap)


def encode_pbzx(data):
    block_size = 512
    output = bytearray(pack(">4sQ", b"pbzx", block_size))
    for offset in range(0, len(data), block_size):
        block = data[offset:offset + block_size]
        compressed = lzma.compress(block, check=lzma.CHECK_NONE)
        # Include both encodings and an unrelated member that spans chunks.
        packed = compressed if offset % 1024 == 0 and len(compressed) < len(block) else block
        output.extend(pack(">QQ", len(block), len(packed)))
        output.extend(packed)
    return bytes(output)

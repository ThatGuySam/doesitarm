"""Construct a flat XAR package containing Distribution, PackageInfo and CPIO."""
import bz2
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


def cpio(files, *, odc, modes=None):
    output = bytearray()
    for index, (name, data) in enumerate([*files, ("TRAILER!!!", b"")], 1):
        mode = (modes or {}).get(name, 0o100755)
        name = name.encode() + b"\0"
        if odc:
            header = "070707" + "".join(
                f"{field:06o}" for field in [0, index, mode, 0, 0, 1, 0]
            ) + f"{0:011o}{len(name):06o}{len(data):011o}"
        else:
            header = "070701" + "".join(
                f"{field:08x}" for field in [
                    index, mode, 0, 0, 1, 0, len(data), 0, 0, 0, 0, len(name), 0
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

    write_xar(path, payload)


def write_xar(path, payload=None, bom=None, nested=None, distribution=DIST, package_info=INFO, package_info_bzip2=False, scripts=None):
    root = Element("xar")
    toc = SubElement(root, "toc")
    package = SubElement(toc, "file", id="1")
    SubElement(package, "name").text = "Fixture.pkg"
    SubElement(package, "type").text = "directory"
    heap = bytearray()
    members = [
        (toc, "Distribution", distribution, False),
        (package, "PackageInfo", package_info, True),
    ]
    if bom is not None:
        members.append((package, "Bom", bom, True))
    if payload is not None:
        members.append((package, "Payload", payload, False))
    if scripts is not None:
        members.append((package, "Scripts", scripts, False))
    if nested is not None:
        members.append((toc, "Component.pkg", nested, False))
    for index, (parent, name, data, compressed) in enumerate(members, 2):
        entry = SubElement(parent, "file", id=str(index))
        SubElement(entry, "name").text = name
        SubElement(entry, "type").text = "file"
        encoding = "application/octet-stream"
        packed = data
        if name == "PackageInfo" and package_info_bzip2:
            encoding = "application/x-bzip2"
            packed = bz2.compress(data)
        elif compressed:
            encoding = "application/x-gzip"
            packed = zlib.compress(data)
        member = SubElement(entry, "data")
        SubElement(member, "offset").text = str(len(heap))
        SubElement(member, "length").text = str(len(packed))
        SubElement(member, "size").text = str(len(data))
        SubElement(member, "encoding", style=encoding)
        heap.extend(packed)
    toc_data = tostring(root, encoding="utf-8", xml_declaration=True)
    compressed = zlib.compress(toc_data)
    header = pack(">4sHHQQI", b"xar!", 28, 1, len(compressed), len(toc_data), 0)
    path.write_bytes(header + compressed + heap)


def posix_cksum(data):
    length = len(data)
    remainder = 0
    data += length.to_bytes((length.bit_length() + 7) // 8, "little")
    for byte in data:
        remainder ^= byte << 24
        for _ in range(8):
            if remainder & 0x80000000:
                remainder = (remainder << 1) ^ 0x04c11db7
            else:
                remainder <<= 1
            remainder &= 0xFFFFFFFF
    return remainder ^ 0xFFFFFFFF


def encode_bom(records):
    blocks = [b""] * 5
    entries = []
    for index, (name, parent, data) in enumerate(records, 1):
        is_file = data is not None
        data = data or b""
        permission = 0o100644 if is_file else 0o040755
        metadata = pack(">BBHHIIIIBII", 1 if is_file else 2, 1, 0, permission,
                        0, 0, 0, len(data), 1, posix_cksum(data) if is_file else 0, 0)
        metadata_id = len(blocks)
        blocks.extend([metadata, pack(">II", index, metadata_id), pack(">I", parent) + name.encode() + b"\0"])
        entries.append(pack(">II", metadata_id + 1, metadata_id + 2))
    blocks[1] = pack(">4sIIIIB", b"tree", 1, 2, 4096, len(entries), 0)
    split = len(entries) - 1
    blocks[2] = pack(">HHIIII", 0, 1, 0, 0, 3, 0)
    blocks[3] = pack(">HHII", 1, split, 4, 0) + b"".join(entries[:split])
    blocks[4] = pack(">HHII", 1, 1, 0, 3) + entries[-1]
    output = bytearray(32)
    indexes = []
    for block in blocks:
        indexes.append(pack(">II", len(output), len(block)))
        output.extend(block)
    variables = pack(">IIB5s", 1, 1, 5, b"Paths")
    variable_offset = len(output)
    output.extend(variables)
    index = pack(">I", len(indexes)) + b"".join(indexes)
    output[:32] = pack(">8s6I", b"BOMStore", 1, len(blocks) - 1, len(output),
                       len(index), variable_offset, len(variables))
    output.extend(index)
    return output


def late_bom_fixture(path, info_path, bin_path, metadata, executable, *, reordered_bom=False):
    plist = plistlib.dumps(metadata)
    filler = b"F" * (710 * 1024)
    extra = [(f"unrelated-{i}", b"side") for i in range(40)] if reordered_bom else []
    prefix = cpio([(bin_path, executable), ("unrelated", filler), *extra], odc=True)
    end = cpio([(info_path, plist)], odc=True)
    trailer_len = len(cpio([], odc=True))
    encoder = zlib.compressobj(0, zlib.DEFLATED, 31)
    payload = (
        encoder.compress(prefix[:-trailer_len]) + encoder.flush(zlib.Z_FULL_FLUSH)
        + encoder.compress(end) + encoder.flush()
    )
    root, contents, info = info_path.split("/")
    binary = bin_path.split("/")[-1]
    bom = encode_bom([
        (".", 0, None),
        (root, 1, None),
        (contents, 2, None),
        ("MacOS", 3, None),
        (binary, 4, executable),
        ("unrelated", 1, filler),
        (info, 3, plist),
        *((name, 1, data) for name, data in extra),
    ])
    write_xar(path, payload, bom)


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

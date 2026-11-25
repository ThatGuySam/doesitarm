#!/usr/bin/env python3
"""Generate small, inert Windows scanner inputs without a Windows toolchain."""
from io import BytesIO
from pathlib import Path
from struct import pack, pack_into
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
from zlib import crc32

OUT = Path(__file__).with_name("windows")


def utf16(text):
    return (text + "\0").encode("utf-16le")


def pad(data):
    return data + bytes(-len(data) % 4)


def version_block(key, value=b"", *children, text=False):
    content = pad(bytes(6) + utf16(key)) + value
    if children:
        content = pad(content) + b"".join(map(pad, children))
    value_length = len(value) // 2 if text else len(value)
    return pack("<HHH", len(content), value_length, text) + content[6:]


def version_resource(product, publisher, version, description=None):
    values = [("ProductName", product), ("CompanyName", publisher), ("ProductVersion", version)]
    if description:
        values.append(("FileDescription", description))
    fields = [
        version_block(key, utf16(value), text=True)
        for key, value in values
    ]
    fixed = pack("<13I", 0xFEEF04BD, 0x10000, 0, 0, 0x10002, 0x30004, *([0] * 7))
    values = version_block(
        "VS_VERSION_INFO", fixed,
        version_block("StringFileInfo", b"", version_block("040904B0", b"", *fields)),
    )
    resource = bytearray(88)
    for offset, name, destination in [(0, 16, 24), (24, 1, 48), (48, 1033, 72)]:
        pack_into("<H", resource, offset + 14, 1)
        pack_into("<II", resource, offset + 16, name, destination | (0x80000000 if offset < 48 else 0))
    pack_into("<IIII", resource, 72, 0x1000 + 88, len(values), 0, 0)
    return resource + values


def pe(machine=0xAA64, *, clr=None, hybrid=None, metadata=None, section_name=b".rsrc",
       overlay=b"", setup_resource=None, section_offset=512):
    is_64 = machine != 0x14C
    dirs = 112 if is_64 else 96
    opt_size = dirs + 128
    base = 0x140000000 if is_64 else 0x400000
    header = bytearray(512)
    header[:2] = b"MZ"
    pack_into("<I", header, 60, 128)
    pack_into("<4sHHIIIHH", header, 128, b"PE\0\0", machine, 1, 0, 0, 0, opt_size, 2)
    opt = 152
    pack_into("<H", header, opt, 0x20B if is_64 else 0x10B)
    pack_into("<Q" if is_64 else "<I", header, opt + (24 if is_64 else 28), base)
    pack_into("<I", header, opt + 60, 512)
    pack_into("<H", header, opt + 68, 2)
    pack_into("<I", header, opt + dirs - 4, 16)

    def directory(index, offset, size):
        pack_into("<II", header, opt + dirs + index * 8, 0x1000 + offset, size)

    section = bytearray(1024)
    if metadata:
        data = version_resource(*metadata)
        section[:len(data)] = data
        directory(2, 0, len(data))
    if setup_resource == "squirrel":
        pack_into("<H", section, 12, 1)
        pack_into("<II", section, 16, 0x80000000 | 88, 0x80000000 | 24)
        for offset, name, destination in [(24, 131, 48), (48, 1033, 72)]:
            pack_into("<H", section, offset + 14, 1)
            pack_into("<II", section, offset + 16, name, destination | (0x80000000 if offset < 48 else 0))
        pack_into("<IIII", section, 72, 0x1000 + 100, 4, 0, 0)
        section[88:98] = pack("<H", 4) + "DATA".encode("utf-16le")
        section[100:104] = b"PK\x03\x04"
        directory(2, 0, 104)
    if clr is not None:
        pack_into("<IHHIII", section, 512, 72, 2, 5, 0x1300, 32, clr)
        directory(14, 512, 72)
    if hybrid:
        directory(10, 512, 230)
        pack_into("<I", section, 512, 230)
        if hybrid == "ec":
            pack_into("<Q", section, 512 + 200, base + 0x1300)
            pack_into("<III", section, 768, 2, 0x1340, 1)
        else:
            pack_into("<IH", section, 512 + 224, 768, 1)
            if hybrid == "x2":
                fixups = pack("<IIQII", 24, 12, 6, 0, 0)
                version = 2
            else:
                fixups = pack("<QI", 6 if hybrid == "x1" else 5, 12)
                version = 1
            fixups += pack("<III", 0x1000, 12, 0x00001800)
            pack_into("<II", section, 768, version, len(fixups))
            section[776:776 + len(fixups)] = fixups
    pack_into("<8sIIII", header, opt + opt_size, section_name, len(section), 0x1000, len(section), section_offset)
    return header + bytes(section_offset - len(header)) + section + overlay


def msi(platform="Arm64;1033", *, is_msi=True):
    end, free, fat_sector = 0xFFFFFFFE, 0xFFFFFFFF, 0xFFFFFFFD
    summary_id = bytes.fromhex("e0859ff2f94f6810ab9108002b27b3d9")
    template = platform.encode() + b"\0"
    value = pad(pack("<II", 30, len(template)) + template)
    section = pack("<IIII", 16 + len(value), 1, 7, 16) + value
    summary = pack("<HHI", 0xFFFE, 0, 0) + bytes(16) + pack("<I", 1) + summary_id + pack("<I", 48) + section
    strings = [b"ProductName", b"Fixture MSI", b"Manufacturer", b"Fixture Publisher", b"ProductVersion", b"1.2.3"]
    pool = pack("<HH", 1252, 0) + b"".join(pack("<HH", len(item), 1) for item in strings)
    property_table = pack("<6H", 1, 3, 5, 2, 4, 6)
    mini_sectors = []
    mini_fat = []

    def alloc(stream):
        start = len(mini_sectors)
        for i in range(0, len(stream), 64):
            mini_sectors.append(stream[i:i + 64].ljust(64, b"\0"))
            mini_fat.append(len(mini_sectors) if i + 64 < len(stream) else end)
        return start, len(stream)

    alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz._"
    def stream_name(name):
        encoded = [0x4840]
        for i in range(0, len(name), 2):
            first = alphabet.index(name[i])
            encoded.append(0x4800 + first if i + 1 == len(name)
                           else 0x3800 + first + 64 * alphabet.index(name[i + 1]))
        return "".join(map(chr, encoded))

    def directory(name, kind, sector, length, left=free, right=free, child=free):
        record = bytearray(128)
        encoded = utf16(name)
        record[:len(encoded)] = encoded
        pack_into("<HBBIII", record, 64, len(encoded), kind, 1, left, right, child)
        pack_into("<IQ", record, 116, sector, length)
        if kind == 5 and is_msi:
            record[80:96] = bytes.fromhex("84100c0000000000c000000000000046")
        return record

    summaries = directory("\x05SummaryInformation", 2, *alloc(summary))
    pool = directory(stream_name("_StringPool"), 2, *alloc(pool), left=3, right=4)
    data = directory(stream_name("_StringData"), 2, *alloc(b"".join(strings)), left=1)
    prop = directory(stream_name("Property"), 2, *alloc(property_table))
    root_data = b"".join(mini_sectors)
    root = directory("Root Entry", 5, 4, len(root_data), child=2)
    assert len(root_data) <= 512
    header = bytearray(512)
    header[:8] = bytes.fromhex("d0cf11e0a1b11ae1")
    pack_into("<5H", header, 24, 0x3E, 3, 0xFFFE, 9, 6)
    pack_into("<10I", header, 40, 0, 1, 1, 0, 4096, 3, 1, end, 0, 0)
    header[80:] = pack("<108I", *([free] * 108))
    fat = pack("<128I", fat_sector, 2, end, end, end, *([free] * 123))
    mini_table = pack("<128I", *(mini_fat + [free] * (128 - len(mini_fat))))
    return header + fat + root + summaries + pool + data + prop + bytes(384) + mini_table + root_data.ljust(512, b"\0")


def zip_file(entries):
    output = BytesIO()
    with ZipFile(output, "w") as archive:
        for name, content in entries:
            archive.writestr(ZipInfo(name), content, compress_type=ZIP_DEFLATED)
    return output.getvalue()


def sevenz_file(name, data):
    # One file in one uncompressed Copy block and an unencoded header.
    assert 128 <= len(data) < 16384
    packed_size = bytes([0x80 | len(data) >> 8, len(data) & 255])
    streams = (b"\x04\x06\x00\x01\x09" + packed_size + b"\x00"
               + b"\x07\x0b\x01\x00\x01\x01\x00\x0c" + packed_size
               + b"\x00\x08\x0a\x01" + pack("<I", crc32(data)) + b"\x00\x00")
    name_data = b"\x00" + utf16(name)
    files = b"\x05\x01\x11" + bytes([len(name_data)]) + name_data + b"\x00"
    index = b"\x01" + streams + files + b"\x00"
    start = pack("<QQI", len(data), len(index), crc32(index))
    return b"7z\xbc\xaf\x27\x1c\x00\x04" + pack("<I", crc32(start)) + start + data + index


def cabinet(data, codec=0):
    first_file = 44
    entry = pack("<IIHHHH", len(data), 0, 0, 0, 0, 0) + b"fixture.exe\0"
    first_block = first_file + len(entry)
    block = pack("<IHH", 0, len(data), len(data)) + data
    header = pack("<4sIIIIIBBHHHHH", b"MSCF", 0, first_block + len(block),
                  0, first_file, 0, 3, 1, 1, 1, 0, 0, 0)
    return header + pack("<IHH", first_block, 1, codec) + entry + block


def stub_fixtures():
    write("nsis.exe", pe(0x14C, overlay=pack("<II12sII", 0, 0xDEADBEEF, b"NullsoftInst", 10, 28)))
    write("burn.exe", pe(0x14C, section_name=b".wixburn"))
    write("inno.exe", pe(0x14C, overlay=b"Inno Setup Setup Data (6.4.0)"))
    write("squirrel.exe", pe(0x14C, metadata=("Squirrel Installer", "Fixture Publisher", "1.2", "Installer for Squirrel-based applications")))
    write("squirrel-resource.exe", pe(0x14C, setup_resource="squirrel"))
    write("sfx.exe", pe(0x14C, overlay=b";!@Install@!UTF-8!\n;!@InstallEnd@!7z\xbc\xaf\x27\x1c" + bytes(32)))
    write("generic-setup.exe", pe(0x14C, metadata=("Fixture Setup", "Fixture Publisher", "1.2")))


def packages():
    namespace = "http://schemas.microsoft.com/appx/manifest/foundation/windows10"
    manifest = f"""<Package xmlns="{namespace}">
      <Identity Name="Fixture.Identity" Publisher="CN=Fixture Identity" Version="1.2.3.4" ProcessorArchitecture="arm64"/>
      <Properties><DisplayName>Fixture MSIX</DisplayName><PublisherDisplayName>Fixture Publisher</PublisherDisplayName></Properties>
    </Package>"""
    bundle = """<Bundle xmlns="http://schemas.microsoft.com/appx/2013/bundle">
      <Identity Name="Fixture.Bundle" Publisher="CN=Fixture Publisher" Version="1.2.3.4"/>
      <Packages>
        <Package Type="application" Architecture="x64"/>
        <Package Type="application" Architecture="arm64"/>
        <Package Type="resource" Architecture="neutral"/>
      </Packages>
    </Bundle>"""
    write("fixture.msix", zip_file([("AppxManifest.xml", manifest.encode("utf-16"))]))
    write("fixture.appxbundle", zip_file([("AppxMetadata/AppxBundleManifest.xml", bundle)]))
    write("bogus.appx", zip_file([("AppxManifest.xml", "<!DOCTYPE a [<!ENTITY x SYSTEM 'http://invalid'>]><a>&x;</a>")]))
    write("arm64.msi", msi())
    write("x86.msi", msi(";1033"))
    write("invalid-msi.cfb", msi(is_msi=False))
    binary = pe(metadata=("Fixture Product", "Fixture Publisher", "1.2.3"))
    write("portable.zip", zip_file([("private/example.exe", binary), ("bin/example.dll", pe(0x8664))]))
    deep = pe(metadata=("Rarely Read", "Fixture Publisher", "1.2.3"), section_offset=256 * 1024)
    write("deep-version.zip", zip_file([("app.exe", deep)]))
    hybrid = pe(0x8664, hybrid="ec", section_offset=256 * 1024)
    write("deep-hybrid.zip", zip_file([("app.exe", hybrid)]))
    write("ambiguous.zip", zip_file([("fixture.exe", binary), ("helper.exe", pe(0x8664))]))
    write("portable.7z", sevenz_file("fixture.exe", binary))
    write("stored.cab", cabinet(binary))
    write("opaque.cab", cabinet(binary, codec=3))


def write(name, data):
    (OUT / name).write_bytes(data)


def main():
    OUT.mkdir(exist_ok=True)
    write("arm64.exe", pe(metadata=("Fixture Product", "Fixture Publisher", "1.2.3")))
    write("x64.exe", pe(0x8664))
    write("x86.exe", pe(0x14C))
    write("arm64ec.exe", pe(0x8664, hybrid="ec"))
    write("arm64x-v1.dll", pe(hybrid="x1"))
    write("arm64x-v2.dll", pe(hybrid="x2"))
    write("other-relocation.dll", pe(hybrid="other"))
    write("anycpu.exe", pe(0x14C, clr=1))
    write("required32.exe", pe(0x14C, clr=3))
    write("preferred32.exe", pe(0x14C, clr=0x20003))
    write("redacted.exe", pe(metadata=("C:\\Users\\alice\\Example", "alice@example.com", "1.2.3")))
    write("invalid-mz.exe", b"MZ" + bytes(62))
    stub_fixtures()
    packages()


if __name__ == "__main__":
    main()

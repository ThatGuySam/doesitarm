#!/usr/bin/env python3
"""Generate small, inert Windows scanner inputs without a Windows toolchain."""
from pathlib import Path
from struct import pack, pack_into

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


def version_resource(product, publisher, version):
    fields = [
        version_block(key, utf16(value), text=True)
        for key, value in [
            ("ProductName", product),
            ("CompanyName", publisher),
            ("ProductVersion", version),
        ]
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


def pe(machine=0xAA64, *, clr=None, hybrid=None, metadata=None, section_name=b".rsrc", overlay=b""):
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
    pack_into("<8sIIII", header, opt + opt_size, section_name, len(section), 0x1000, len(section), 512)
    return header + section + overlay


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


if __name__ == "__main__":
    main()

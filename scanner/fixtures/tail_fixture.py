#!/usr/bin/env python3
"""Generate tiny archives that stress source-read accounting and termination.

Each output is under 2 MiB on disk. The logical sizes are far larger.
Run from anywhere: python3 fixtures/tail_fixture.py
"""
import struct
import zipfile
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "tail"
MIB = 1024 * 1024


def pad_dmg(data: bytes, zeros: int) -> bytes:
    """Prepend zeros to a UDIF image and move its data fork and XML offsets."""
    koly = len(data) - 512
    assert data[koly:koly + 4] == b"koly"
    trailer = bytearray(data[koly:])
    data_fork = struct.unpack_from(">Q", trailer, 24)[0]
    xml = struct.unpack_from(">Q", trailer, 216)[0]
    struct.pack_into(">Q", trailer, 24, data_fork + zeros)
    struct.pack_into(">Q", trailer, 216, xml + zeros)
    return bytes(zeros) + data[:koly] + bytes(trailer)


def deflate_zeros(count: int) -> bytes:
    compressor = zlib.compressobj(9, zlib.DEFLATED, -15)
    block = bytes(MIB)
    out = bytearray()
    for _ in range(count // MIB):
        out += compressor.compress(block)
    out += compressor.flush()
    return bytes(out)


def raw_zip(path: Path, entries):
    """entries: (name, method, crc, packed, expanded, mode) tuples. Writes a plain ZIP."""
    body = bytearray()
    central = bytearray()
    for name, method, crc, packed, expanded, mode in entries:
        raw = name.encode()
        offset = len(body)
        body += struct.pack("<IHHHHHIIIHH", 0x04034B50, 20, 0, method, 0, 0x21, crc,
                            len(packed), expanded, len(raw), 0) + raw + packed
        central += struct.pack("<IHHHHHHIIIHHHHHII", 0x02014B50, 0x031E, 20, 0, method, 0, 0x21,
                               crc, len(packed), expanded, len(raw), 0, 0, 0, 0,
                               mode << 16, offset) + raw
    end = struct.pack("<IHHHHIIH", 0x06054B50, 0, 0, len(entries), len(entries), len(central),
                      len(body), 0)
    path.write_bytes(bytes(body) + bytes(central) + end)


def main():
    OUT.mkdir(exist_ok=True)
    dmg = (ROOT / "hfsx.dmg").read_bytes()

    # Cause A: a deflated disk image inside a ZIP. The disk image is read back to
    # front, so each backward jump replays the compressed member from its start.
    big = pad_dmg(dmg, 48 * MIB)
    with zipfile.ZipFile(OUT / "deflated-dmg.zip", "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.writestr(zipfile.ZipInfo("Wrapper/Fixture.dmg"), big, compress_type=zipfile.ZIP_DEFLATED)

    # Cause B: an executable entry that is 1.5 GiB of zeros (about 1.5 MiB packed).
    zeros = 1536 * MIB
    packed = deflate_zeros(zeros)
    raw_zip(OUT / "zeros-executable.zip",
            [("Fixture.app/Contents/MacOS/Fixture", 8, 0, packed, zeros, 0o100755),
             ("Fixture.app/Contents/Info.plist", 0, zlib.crc32(b"x"), b"x", 1, 0o100644)])

    # Cause C: many entries sharing one local header and data.
    packed_small = zlib.compress(bytes(64 * 1024), 9)[2:-4]
    entries = [(f"A{i}.app/Contents/MacOS/A{i}", 8, 0, packed_small, 64 * 1024, 0o100755)
               for i in range(2000)]
    raw_zip(OUT / "many-entries.zip", entries)


if __name__ == "__main__":
    main()

"""Generate a Rock Ridge ISO 9660 disk image inside a bzip2 UDIF."""
import bz2
import plistlib
from struct import pack

from dmg_fixture import write_udif

BLOCK = 2048


def both16(value):
    return pack("<H", value) + pack(">H", value)


def both32(value):
    return pack("<I", value) + pack(">I", value)


def record(name, block, size=BLOCK, *, directory=False, system_use=b""):
    name_field = bytes([len(name)]) + name + bytes(not len(name) % 2)
    body = (b"\0" + both32(block) + both32(size) + bytes([126, 11, 24, 0, 0, 0, 0])
            + bytes([2 if directory else 0, 0, 0]) + both16(1) + name_field + system_use)
    return bytes([1 + len(body)]) + body


def rock_ridge(name):
    return b"NM" + bytes([5 + len(name), 1, 0]) + name


def iso_dmg_fixture(path, metadata, executable):
    volume = bytearray(BLOCK * 32)

    def put(block, data):
        offset = block * BLOCK
        volume[offset:offset + len(data)] = data

    def directory(block, parent, *entries):
        system_use = b"SP\x07\x01\xbe\xef\0" if block == parent else b""
        local = record(b"\0", block, directory=True, system_use=system_use)
        above = record(b"\x01", parent, directory=True)
        put(block, local + above + b"".join(entries))

    pvd = bytearray(BLOCK)
    pvd[:7] = b"\x01CD001\x01"
    pvd[8:72] = b" ".ljust(32) + b"FIXTURE".ljust(32)
    pvd[80:88] = both32(len(volume) // BLOCK)
    pvd[120:128] = both16(1) * 2
    pvd[128:132] = both16(BLOCK)
    for order, location in (("<", 19), (">", 20)):
        table = bytearray()
        names = (b"\0", b"FIXTURE.APP", b"CONTENTS", b"MACOS")
        for index, name in enumerate(names):
            table.extend(pack(order + "BBIH", len(name), 0, 23 + index, max(1, index)))
            table.extend(name + bytes(len(name) % 2))
        put(location, table)
    pvd[132:140] = both32(len(table))
    pvd[140:144] = pack("<I", 19)
    pvd[148:152] = pack(">I", 20)
    pvd[156:190] = record(b"\0", 23, directory=True)
    pvd[881] = 1
    put(16, pvd)
    put(17, b"\xffCD001\x01")
    directory(23, 23, record(b"FIXTURE.APP", 24, directory=True,
                             system_use=rock_ridge(b"Fixture.app")))
    directory(24, 23, record(b"CONTENTS", 25, directory=True,
                             system_use=rock_ridge(b"Contents")))
    info = plistlib.dumps(metadata)
    directory(25, 24, record(b"INFO.PLI;1", 27, len(info),
                             system_use=rock_ridge(b"Info.plist")),
              record(b"MACOS", 26, directory=True, system_use=rock_ridge(b"MacOS")))
    directory(26, 25, record(b"FIXTUREB.;1", 28, len(executable),
                             system_use=rock_ridge(b"FixtureBinary")))
    put(27, info)
    put(28, executable)

    write_udif(path, volume, [(0x80000006, len(volume) // 512, bz2.compress)],
               "whole disk (unknown partition : 0)", with_preamble=False)

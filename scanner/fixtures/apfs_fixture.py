"""Build a checksummed APFS container with linked object maps and two file extents."""
import plistlib
import zlib
from struct import iter_unpack, pack, pack_into

from dmg_fixture import write_udif

BLOCK = 4096
BLOCKS = 32
VOLUME_ID = 1024


def block(oid, xid, kind, subtype=0):
    data = bytearray(BLOCK)
    pack_into("<QQII", data, 8, oid, xid, kind, subtype)
    return data


def checksum(data):
    modulus = 0xFFFFFFFF
    low = high = 0
    for (value,) in iter_unpack("<I", data[8:]):
        low += value
        high += low
    check_low = modulus - (low + high) % modulus
    check_high = modulus - (low + check_low) % modulus
    pack_into("<II", data, 0, check_low, check_high)
    return data


def superblock(xid, omap_block):
    data = block(1, xid, 0x80000001)
    pack_into("<4sIQ", data, 32, b"NXSB", BLOCK, BLOCKS)
    pack_into("<I", data, 104, 3)
    pack_into("<Q", data, 112, 1)
    pack_into("<Q", data, 160, omap_block)
    pack_into("<IQ", data, 180, 1, VOLUME_ID)
    return checksum(data)


def object_map(address, tree):
    data = block(address, 12, 0x4000000B)
    pack_into("<I", data, 40, 0x40000002)
    pack_into("<Q", data, 48, tree)
    return checksum(data)


def mapped(oid, xid, address, flags=0):
    return pack("<QQ", oid, xid), pack("<IIQ", flags, BLOCK, address)


def tree_node(oid, records, *, root=False, fixed=False, level=0):
    object_type = 2 if root else 3
    if fixed:
        object_type |= 0x40000000
    data = block(oid, 12, object_type, 11 if fixed else 14)
    flags = int(root) | (2 if level == 0 else 0) | (4 if fixed else 0)
    toc_width = 4 if fixed else 8
    toc_len = len(records) * toc_width
    pack_into("<HHIHH", data, 32, flags, level, len(records), 0, toc_len)
    key_start = 56 + toc_len
    val_end = BLOCK - (40 if root else 0)
    key_pos, val_pos = key_start, val_end
    for index, (key, value) in enumerate(records):
        val_pos -= len(value)
        data[key_pos:key_pos + len(key)] = key
        data[val_pos:val_pos + len(value)] = value
        positions = (key_pos - key_start, val_end - val_pos)
        if fixed:
            pack_into("<HH", data, 56 + index * toc_width, *positions)
        else:
            pack_into("<HHHH", data, 56 + index * toc_width,
                      positions[0], len(key), positions[1], len(value))
        key_pos += len(key)
    assert key_pos <= val_pos
    if root:
        pack_into("<IIIIIIQQ", data, val_end, 0x10 if fixed else 0, BLOCK,
                  16 if fixed else 0, 16 if fixed else 0, 32, 160, len(records), 1)
    return checksum(data)


def key(id_, kind):
    return pack("<Q", id_ | kind << 60)


def name_record(parent, name, file_id, kind):
    name = name.encode("utf-8") + b"\0"
    return key(parent, 9) + pack("<I", len(name)) + name, pack("<QQH", file_id, 0, kind)


def inode(id_, data_id, size):
    data = bytearray(92)
    pack_into("<Q", data, 8, data_id)
    pack_into("<H", data, 80, 0o100755)
    return key(id_, 3), data + pack("<HHBBHQQQQQ", 1, 44, 8, 0, 40, size, BLOCK, 0, size, 0)


def extent(data_id, offset, address):
    return key(data_id, 8) + pack("<Q", offset), pack("<QQQ", BLOCK, address, 0)


def apfs_fixture(path, metadata, executable):
    volume = bytearray(BLOCK * BLOCKS)

    def put(address, data):
        start = address * BLOCK
        volume[start:start + len(data)] = data

    put(0, superblock(11, 30))
    put(2, superblock(12, 6))
    put(6, object_map(6, 7))
    put(7, tree_node(7, [mapped(VOLUME_ID, 11, 15), mapped(VOLUME_ID, 12, 8),
                        mapped(VOLUME_ID, 13, 0, flags=1)], root=True, fixed=True))
    fs = block(VOLUME_ID, 12, 13)
    fs[32:36] = b"APSB"
    pack_into("<Q", fs, 56, 9)
    pack_into("<QQ", fs, 128, 9, 2000)
    pack_into("<Q", fs, 264, 1)
    put(8, checksum(fs))
    put(9, object_map(9, 10))
    put(10, tree_node(10, [mapped(2000, 12, 11), mapped(2001, 12, 12),
                           mapped(2002, 12, 13)], root=True, fixed=True))

    plist = plistlib.dumps(metadata, fmt=plistlib.FMT_BINARY)
    first = [name_record(2, "Fixture.app", 16, 4), name_record(16, "Contents", 17, 4)]
    second = [
        name_record(17, "Info.plist", 18, 8), name_record(17, "MacOS", 19, 4),
        inode(18, 30, len(plist)), name_record(19, "FixtureBinary", 20, 8),
        inode(20, 31, len(executable)), extent(30, 0, 14), extent(31, 0, 16),
        extent(31, BLOCK, 18),
    ]
    put(11, tree_node(2000, [(first[0][0], pack("<Q", 2001)), (second[0][0], pack("<Q", 2002))],
                      root=True, level=1))
    put(12, tree_node(2001, first))
    put(13, tree_node(2002, second))
    put(14, plist)
    put(16, executable[:BLOCK])
    put(18, executable[BLOCK:])

    chunks = [(0x80000005, 14 * 8, zlib.compress), (1, (BLOCKS - 14) * 8, bytes)]
    write_udif(path, volume, chunks, "Apple_APFS")

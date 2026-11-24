"""Construct a small HFSX volume inside a multi-codec UDIF image."""
import bz2
import lzma
import plistlib
import zlib
from struct import pack, pack_into

SECTOR = 512
VOLUME_SECTORS = 128


def fork(size, blocks, extents):
    return pack(">QII", size, 0, blocks) + b"".join(
        pack(">II", start, count) for start, count in extents
    ).ljust(64, b"\0")


def node(kind, records, *, next_node=0, prev_node=0, height=1):
    header = pack(">IIbBHH", next_node, prev_node, kind, height, len(records), 0)
    offsets = [len(header)]
    for record in records:
        offsets.append(offsets[-1] + len(record))
    index = b"".join(pack(">H", offset) for offset in reversed(offsets))
    return (header + b"".join(records)).ljust(SECTOR - len(index), b"\0") + index


def tree_header(root, leaves, first_leaf, last_leaf, nodes, depth):
    record = bytearray(106)
    pack_into(">HIIIIHHII", record, 0, depth, root, leaves, first_leaf, last_leaf,
              SECTOR, 516, nodes, 0)
    record[37] = 0xBC  # HFSX binary comparison
    return node(1, [record], height=0)


def key(parent, name):
    name = name.encode("utf-16-be")
    return pack(">HIH", 6 + len(name), parent, len(name) // 2) + name


def folder(id_):
    return pack(">HHII", 1, 0, 0, id_).ljust(88, b"\0")


def file(id_, data_fork):
    record = bytearray(248)
    pack_into(">H", record, 0, 2)
    pack_into(">I", record, 8, id_)
    pack_into(">H", record, 42, 0o100755)
    record[88:168] = data_fork
    return record


def data_at(volume, block, data):
    start = block * SECTOR
    volume[start:start + len(data)] = data


def hfs_volume(metadata, executable):
    volume = bytearray(VOLUME_SECTORS * SECTOR)
    header = bytearray(SECTOR)
    header[:4] = b"HX\0\5"
    pack_into(">II", header, 40, SECTOR, VOLUME_SECTORS)
    header[192:272] = fork(2 * SECTOR, 2, [(10, 2)])
    header[272:352] = fork(5 * SECTOR, 5, [(5, 5)])
    data_at(volume, 2, header)

    info = plistlib.dumps(metadata, fmt=plistlib.FMT_BINARY)
    assert len(info) < SECTOR
    initial = [(20 + 2 * i, 1) for i in range(8)]
    remainder = (36, 1)
    assert len(executable) <= 9 * SECTOR
    for index, (block, _) in enumerate([*initial, remainder]):
        data_at(volume, block, executable[index * SECTOR:(index + 1) * SECTOR])

    folder_app = key(2, "Fixture.app")
    folder_contents = key(16, "Contents")
    info_file = key(17, "Info.plist")
    folder_macos = key(17, "MacOS")
    exec_file = key(19, "FixtureBinary")
    data_at(volume, 5, tree_header(1, 5, 2, 4, 5, 2))
    data_at(volume, 6, node(0, [name + pack(">I", index) for index, name in
                                enumerate([folder_app, info_file, exec_file], 2)], height=2))
    data_at(volume, 7, node(-1, [folder_app + folder(16), folder_contents + folder(17)], next_node=3))
    data_at(volume, 8, node(-1, [info_file + file(18, fork(len(info), 1, [(13, 1)])),
                                folder_macos + folder(19)], next_node=4, prev_node=2))
    data_at(volume, 9, node(-1, [exec_file + file(20, fork(len(executable), 9, initial))], prev_node=3))
    data_at(volume, 10, tree_header(1, 1, 1, 1, 2, 1))
    overflow_key = pack(">HBBII", 10, 0, 0, 20, 8)
    overflow_value = pack(">II", *remainder).ljust(64, b"\0")
    data_at(volume, 11, node(-1, [overflow_key + overflow_value]))
    data_at(volume, 13, info)
    return volume


def adc_literals(data):
    return b"".join(bytes([0x80 | (len(chunk) - 1)]) + chunk
                    for start in range(0, len(data), 128)
                    if (chunk := data[start:start + 128]))


def dmg_fixture(path, metadata, executable):
    volume = hfs_volume(metadata, executable)
    chunks = [
        (0, 1, lambda _: b""),
        (2, 1, lambda _: b""),
        (0x80000005, 3, zlib.compress),
        (1, 2, bytes),
        (0x80000006, 3, bz2.compress),
        (0x80000008, 3, lzma.compress),
        (0x80000004, 1, adc_literals),
        (1, 6, bytes),
        (0x80000007, 1, lambda raw: b"bvx-" + pack("<I", len(raw)) + raw + b"bvx$"),
        (1, VOLUME_SECTORS - 21, bytes),
    ]
    write_udif(path, volume, chunks, "Apple_HFSX")


def write_udif(path, volume, chunks, name, *, with_preamble=True):
    sectors = len(volume) // SECTOR
    assert sum(count for _, count, _ in chunks) == sectors
    preamble = b"Test data fork at a nonzero file offset.\n" if with_preamble else b""
    data_offset = 16 if with_preamble else 0
    body = bytearray(data_offset)
    mish = bytearray(204)
    pack_into(">4sIQQQ", mish, 0, b"mish", 1, 0, sectors, len(body))
    pack_into(">I", mish, 200, len(chunks) + 1)
    sector = 0
    for kind, count, compress in chunks:
        data = volume[sector * SECTOR:(sector + count) * SECTOR]
        packed = compress(data)
        mish.extend(pack(">IIQQQQ", kind, 0, sector, count, len(body) - data_offset, len(packed)))
        body.extend(packed)
        sector += count
    mish.extend(pack(">IIQQQQ", 0xFFFFFFFF, 0, sector, 0, 0, 0))
    index = plistlib.dumps({"resource-fork": {"blkx": [{"Name": name, "Data": bytes(mish)}]}})
    trailer = bytearray(SECTOR)
    pack_into(">4sIIIQQQ", trailer, 0, b"koly", 4, SECTOR, 1, 0, len(preamble), len(body))
    pack_into(">II", trailer, 56, 1, 1)
    pack_into(">QQ", trailer, 216, len(preamble) + len(body), len(index))
    pack_into(">Q", trailer, 492, sectors)
    path.write_bytes(preamble + body + index + trailer)

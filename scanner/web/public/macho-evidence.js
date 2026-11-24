const THIN = new Map([
  [0xfeedface, [false, 28]], [0xcefaedfe, [true, 28]],
  [0xfeedfacf, [false, 32]], [0xcffaedfe, [true, 32]],
]);
const FAT = new Map([
  [0xcafebabe, [false, 20]], [0xbebafeca, [true, 20]],
  [0xcafebabf, [false, 32]], [0xbfbafeca, [true, 32]],
]);

function commandFields(view, word, start, id, size, little) {
  const at = (offset) => word(start + offset);
  const idBase = id & 0x7fffffff;
  const uint64 = (offset) => view.getBigUint64(start + offset, little).toString();
  if ([0x19, 1].includes(idBase) && size >= (idBase === 0x19 ? 72 : 56)) {
    const wide = idBase === 0x19;
    const name = new Uint8Array(view.buffer, view.byteOffset + start + 8, 16);
    return {
      segment_name: String.fromCharCode(...name).replace(/\0.*$/, ''),
      vm_address: wide ? uint64(24) : at(24), vm_size: wide ? uint64(32) : at(28),
      file_offset: wide ? uint64(40) : at(32), file_size: wide ? uint64(48) : at(36),
      section_count: at(wide ? 64 : 48),
    };
  }
  if (idBase === 0x32 && size >= 24) return { platform: at(8), minimum_os: at(12), sdk: at(16), tools: at(20) };
  if ([0x24, 0x25, 0x2f, 0x30].includes(idBase) && size >= 16) return { minimum_os: at(8), sdk: at(12) };
  if ([0x1d, 0x1e, 0x26, 0x29, 0x2b, 0x2e, 0x33, 0x34].includes(idBase) && size >= 16) {
    return { data_offset: at(8), data_size: at(12) };
  }
  if (idBase === 0x28 && size >= 24) return { entry_offset: uint64(8), stack_size: uint64(16) };
  if (idBase === 2 && size >= 24) {
    return { symbol_offset: at(8), symbol_count: at(12), string_offset: at(16), string_size: at(20) };
  }
  if ([0xc, 0xd, 0x18, 0x1f, 0x20, 0x23].includes(idBase) && size >= 24) {
    return { name_offset: at(8), timestamp: at(12), current_version: at(16), compatibility_version: at(20) };
  }
  return {};
}

// Decode only headers already read by the core for a bare or resolved binary.
// Command payloads and strings from the executable stay out of the export.
export function machoEvidence() {
  let fat;
  let thinAtZero = false;
  let slices = new Map();
  const commandsAt = new Map();
  const headersAt = new Map();
  const lists = [];

  function purpose(offset, length) {
    if (offset === 0 && length === 4) return 'format_magic';
    if (offset === 0 && length === 8 && (fat || thinAtZero)) return fat ? 'fat_header' : 'slice_header';
    if (fat && offset === 8 && length === fat.count * fat.width) return 'fat_slice_table';
    if (length === 8 && slices.has(offset)) return 'slice_header';
    if (headersAt.has(offset)) return 'slice_header_fields';
    if (commandsAt.has(offset)) return 'load_commands';
    return 'container_range';
  }

  function observe(offset, bytes, reason) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (reason === 'format_magic') {
      const magic = view.getUint32(0);
      thinAtZero = THIN.has(magic);
      const shape = FAT.get(magic);
      if (shape) fat = { little: shape[0], width: shape[1] };
    } else if (reason === 'fat_header') {
      fat.count = view.getUint32(4, fat.little);
    } else if (reason === 'fat_slice_table') {
      slices = new Map();
      for (let i = 0; i < fat.count; i += 1) {
        const start = i * fat.width;
        const position = fat.width === 20 ? view.getUint32(start + 8, fat.little)
          : Number(view.getBigUint64(start + 8, fat.little));
        slices.set(position, i);
      }
    } else if (reason === 'slice_header') {
      const thin = THIN.get(view.getUint32(0));
      if (thin) headersAt.set(offset + 8, { offset, little: thin[0], width: thin[1] });
    } else if (reason === 'slice_header_fields') {
      const header = headersAt.get(offset);
      const list = { slice_offset: header.offset, commands: [], truncated: false };
      const count = view.getUint32(8, header.little);
      const size = view.getUint32(12, header.little);
      lists.push(list);
      if (size && count) commandsAt.set(header.offset + header.width, { count, little: header.little, list });
    } else if (reason === 'load_commands') {
      const { count, little, list } = commandsAt.get(offset);
      const word = (position) => view.getUint32(position, little);
      let position = 0;
      for (let i = 0; i < count; i += 1) {
        if (position + 8 > bytes.byteLength) break;
        const id = word(position);
        const size = word(position + 4);
        if (size < 8 || position + size > bytes.byteLength) break;
        list.commands.push({ id, size, fields: commandFields(view, word, position, id, size, little) });
        position += size;
      }
      list.truncated = list.commands.length !== count;
    }
  }

  return { purpose, observe, lists };
}

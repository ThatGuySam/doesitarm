const header = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);

export class WasmReader {
  offset = 0;

  constructor(bytes) {
    this.bytes = bytes;
  }

  take(size) {
    const end = this.offset + size;
    if (end > this.bytes.length) throw new Error('Truncated Wasm data');
    const slice = this.bytes.subarray(this.offset, end);
    this.offset = end;
    return slice;
  }

  byte() {
    return this.take(1)[0];
  }

  unsigned() {
    let value = 0n;
    for (let shift = 0n; shift < 70n; shift += 7n) {
      const byte = this.byte();
      value |= BigInt(byte & 127) << shift;
      if (!(byte & 128)) return value;
    }
    throw new Error('Invalid Wasm integer');
  }

  count() {
    const value = this.unsigned();
    if (value > 0xffffffffn) throw new Error('Invalid Wasm count');
    return Number(value);
  }

  string() {
    return this.take(this.count()).toString('utf8');
  }

  get done() {
    return this.offset === this.bytes.length;
  }
}

export function* wasmSections(bytes) {
  const file = new WasmReader(bytes);
  if (!file.take(header.length).equals(header)) throw new Error('Expected a Wasm 1 module');
  while (!file.done) {
    const start = file.offset;
    const id = file.byte();
    const payload = file.take(file.count());
    const name = id === 0 ? new WasmReader(payload).string() : undefined;
    yield { id, name, payload, encoded: bytes.subarray(start, file.offset) };
  }
}

export function withoutWasmNames(bytes) {
  return Buffer.concat([header, ...Array.from(wasmSections(bytes))
    .filter(section => section.name !== 'name')
    .map(section => section.encoded)]);
}

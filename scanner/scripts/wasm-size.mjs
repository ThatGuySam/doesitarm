#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { WasmReader, wasmSections, withoutWasmNames } from './wasm-sections.mjs';

const sectionNames = [
  'Custom', 'Types', 'Imports', 'Functions', 'Tables', 'Memory', 'Globals',
  'Exports', 'Start', 'Elements', 'Code', 'Data', 'Data count', 'Tags',
];

function skipReferenceType(reader) {
  const type = reader.byte();
  if (type === 0x63 || type === 0x64) reader.unsigned();
}

function skipLimits(reader) {
  const flags = reader.count();
  reader.unsigned();
  if (flags & 1) reader.unsigned();
  if (flags & 8) reader.unsigned(); // Custom page size.
}

function countFunctionImports(payload) {
  if (!payload) return 0;
  const reader = new WasmReader(payload);
  const count = reader.count();
  let functions = 0;
  for (let i = 0; i < count; i++) {
    reader.string();
    reader.string();
    switch (reader.byte()) {
      case 0: reader.count(); functions++; break;
      case 1: skipReferenceType(reader); skipLimits(reader); break;
      case 2: skipLimits(reader); break;
      case 3: skipReferenceType(reader); reader.byte(); break;
      case 4: reader.byte(); reader.count(); break;
      default: throw new Error('Unknown Wasm import kind');
    }
  }
  return functions;
}

function readFunctionNames(sections) {
  const result = new Map();
  for (const section of sections.filter(section => section.name === 'name')) {
    const reader = new WasmReader(section.payload);
    reader.string();
    while (!reader.done) {
      const subsection = reader.byte();
      const contents = new WasmReader(reader.take(reader.count()));
      if (subsection !== 1) continue;
      const count = contents.count();
      for (let i = 0; i < count; i++) result.set(contents.count(), contents.string());
    }
  }
  return result;
}

function ownerOf(functionName) {
  if (!functionName) return 'Unnamed functions';
  const path = functionName.replace(/\[[0-9a-f]{16}\]/g, '');
  const root = /^(?:<)*(?:&(?:mut )?)?([a-zA-Z_]\w*)::/.exec(path) ??
    / as ([a-zA-Z_]\w*)::/.exec(path);
  if (!root) {
    if (/^(__wbindgen|__wasm_bindgen|wasm_bindgen)/.test(path)) return 'wasm-bindgen glue';
    return 'Unclassified symbols';
  }
  const crate = root[1];
  if (['core', 'alloc', 'std', '_rustc'].includes(crate)) return 'Rust core/alloc/std';
  if (crate === 'scan_core') {
    const [segment, next] = path.slice(root.index + root[0].length).split('::', 2);
    const isModule = /^[a-z_][a-z0-9_]*$/.test(segment) && /^[a-zA-Z_]/.test(next ?? '');
    return 'scan-core::' + (isModule ? segment : '(root)');
  }
  return crate.replaceAll('_', '-');
}

function sorted(map) {
  return [...map.values()].sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name, 'en'));
}

function analyze(bytes, symbols) {
  const sections = [...wasmSections(bytes)];
  const header = { name: 'Wasm header', bytes: 8, payloadBytes: 8 };
  const sizeMap = new Map([[header.name, header]]);
  for (const { id, name, encoded, payload } of sections) {
    const label = id ? (sectionNames[id] ?? 'Section ' + id) : 'Custom: ' + name;
    const record = sizeMap.get(label) ?? { name: label, bytes: 0, payloadBytes: 0 };
    record.bytes += encoded.length;
    record.payloadBytes += payload.length;
    sizeMap.set(label, record);
  }

  const code = sections.find(section => section.id === 10);
  if (!code) throw new Error('Wasm file has no code section');
  const imported = countFunctionImports(sections.find(section => section.id === 2)?.payload);
  const names = readFunctionNames(symbols ? [...wasmSections(symbols)] : sections);
  const reader = new WasmReader(code.payload);
  const count = reader.count();
  const framing = code.encoded.length - code.payload.length + reader.offset;
  const codeOwners = new Map([['Code section header', { name: 'Code section header', bytes: framing, functions: 0 }]]);
  const payloadCopies = { entries: 0, bodyBytes: 0, directEntries: 0, directBodyBytes: 0 };
  const inspectCopies = { entries: 0, bodyBytes: 0 };
  let functionBodyBytes = 0;
  for (let i = 0; i < count; i++) {
    const start = reader.offset;
    const length = reader.count();
    reader.take(length);
    functionBodyBytes += length;
    const symbol = names.get(imported + i);
    const owner = ownerOf(symbol);
    const entry = codeOwners.get(owner) ?? { name: owner, bytes: 0, functions: 0 };
    entry.bytes += reader.offset - start;
    entry.functions++;
    codeOwners.set(owner, entry);

    if (symbol?.includes('::pkg::inspect_payload')) {
      payloadCopies.entries++;
      payloadCopies.bodyBytes += length;
      if (/^scan_core(?:\[[\da-f]+\])?::pkg::inspect_payload(?:<|::|$)/.test(symbol)) {
        payloadCopies.directEntries++;
        payloadCopies.directBodyBytes += length;
      }
    }
    if (symbol && /^scan_core(?:\[[\da-f]+\])?::inspect(?:<|::|$)/.test(symbol)) {
      inspectCopies.entries++;
      inspectCopies.bodyBytes += length;
    }
  }
  if (!reader.done) throw new Error('Unexpected bytes after Wasm function bodies');

  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizes: {
      raw: bytes.length,
      gzip: gzipSync(bytes, { level: 9 }).length,
      brotli: brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
    },
    sections: sorted(sizeMap),
    code: {
      functions: count,
      importedFunctions: imported,
      bytes: code.encoded.length,
      functionBodyBytes,
      owners: sorted(codeOwners),
      inspectPayloadSymbols: payloadCopies,
      inspectSymbols: inspectCopies,
    },
  };
}

const number = new Intl.NumberFormat('en-US');
const colors = [
  '#205E78', '#DA753B', '#359380', '#9865AA', '#D4A32F', '#6B83BD',
  '#B85767', '#8A9750', '#9B6B42', '#477679', '#A391AE', '#B46749',
];
function escape(text) {
  return String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function pie(rows, total, cx, cy, radius) {
  let angle = -Math.PI / 2;
  return rows.map((row, i) => {
    const fraction = row.bytes / total;
    const color = colors[i % colors.length];
    const label = '<title>' + escape(row.name) + ' · ' + number.format(row.bytes) + ' B</title>';
    if (fraction === 1) return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${color}">${label}</circle>`;
    const start = [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
    angle += fraction * Math.PI * 2;
    const end = [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
    return `<path fill="${color}" d="M ${cx} ${cy} L ${start.join(' ')} A ${radius} ${radius} 0 ${fraction > 0.5 ? 1 : 0} 1 ${end.join(' ')} Z">${label}</path>`;
  }).join('\n');
}

function legend(row, i, total, x, y) {
  return `<rect x="${x}" y="${y - 11}" width="11" height="11" rx="2" fill="${colors[i % colors.length]}"/>
  <text x="${x + 19}" y="${y}">${escape(row.name)}</text>
  <text class="value" x="${x + 425}" y="${y}" text-anchor="end">${number.format(row.bytes)} B · ${(100 * row.bytes / total).toFixed(2)}%</text>`;
}

function chart(report) {
  const { sizes, sections, code } = report;
  const top = Math.max(540, 361 + sections.length * 22);
  const split = Math.ceil(code.owners.length / 2);
  const height = top + 80 + 22 * split;
  const sectionLegend = sections.map((row, i) => legend(row, i, sizes.raw, 45, 325 + 22 * i));
  const ownerLegend = code.owners.map((row, i) =>
    legend(row, i, code.bytes, i < split ? 45 : 525, top + 23 + 22 * (i % split)));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${height}" viewBox="0 0 1000 ${height}" role="img" aria-labelledby="title description">
  <title id="title">Scanner WebAssembly size</title>
  <desc id="description">The left pie shows raw file bytes by Wasm section. The right pie shows code bytes by function owner. The legends give exact bytes and percent of each pie.</desc>
  <style>
    text { font: 14px system-ui, sans-serif; fill: #182c37 }
    .headline { font-size: 25px; font-weight: 700 }
    .heading { font-size: 17px; font-weight: 650 }
    .value { fill: #405460; font-variant-numeric: tabular-nums }
  </style>
  <rect width="100%" height="100%" fill="#f8faf9"/>
  <text class="headline" x="45" y="45">Scanner WebAssembly size</text>
  <text class="value" x="45" y="72">${number.format(sizes.raw)} B raw · ${number.format(sizes.gzip)} B gzip · ${number.format(sizes.brotli)} B Brotli</text>
  <text class="heading" x="45" y="115">File sections</text>
  <text class="heading" x="525" y="115">Code by function owner</text>
  ${pie(sections, sizes.raw, 245, 210, 88)}
  ${pie(code.owners, code.bytes, 725, 210, 88)}
  ${sectionLegend.join('\n')}
  ${code.owners.slice(0, 5).map((row, i) => legend(row, i, code.bytes, 525, 325 + 22 * i)).join('\n')}
  <text class="heading" x="45" y="${top}">All code owners</text>
  ${ownerLegend.join('\n')}
</svg>
`;
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { symbols: { type: 'string' }, 'out-dir': { type: 'string' } },
});
if (positionals.length !== 1) {
  console.error('Usage: node scripts/wasm-size.mjs <wasm> [--symbols <matching-named-wasm>] [--out-dir <directory>]');
  process.exit(1);
}

const bytes = readFileSync(positionals[0]);
const symbols = values.symbols && readFileSync(values.symbols);
if (symbols && !withoutWasmNames(bytes).equals(withoutWasmNames(symbols))) {
  throw new Error('The measured and named Wasm files differ beyond the name section');
}
const report = analyze(bytes, symbols);
const outDir = values['out-dir'] ?? fileURLToPath(new URL('../results/', import.meta.url));
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'wasm-size.json'), JSON.stringify(report, null, 2) + '\n');
writeFileSync(join(outDir, 'wasm-size-pie.svg'), chart(report));

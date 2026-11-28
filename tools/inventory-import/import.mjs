#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { decode, formats, parseInventory, readJson } from './formats.mjs';
import { approvedGroups, groupInventory, nativeEvidence } from './inventory.mjs';
import { batchInventory, lookupBatches, requestBody } from './mcp.mjs';
import { parsePlist } from './plist.mjs';

const help = `Usage: node import.mjs --format PROFILE [options] FILE

Choose one mode:
  --review FILE       Write the private app projection for local review
  --dry-run           Print one exact initial JSON-RPC body per line and send nothing
  --emit              Export MCP-ready rows JSON or CSV and send nothing
  --lookup            Run the read-only lookup and print the local report

Dry-run, emit and lookup require --approved FILE, a reviewed JSON array.
  --wire rows|csv     Choose the tool argument encoding (default: rows)
  --output-dir DIR    With --emit, write one file per batch to a new directory
  --local-report FILE Write source rows, counts and architecture to a local file
  --cohort LABEL      Name the report's cohort in local output
  --target-macos N    Ask MCP to assess macOS 26, 27 or 28
  --native-evidence FILE
                       Include verified vendor or binary evidence in a lookup
  --encoding LABEL    Decode using a TextDecoder encoding instead of UTF-8/BOM
  --delimiter comma|tab|semicolon
  --columns FILE      One-based column map for mapped-csv
  --mac-only          Confirm an input has already been scoped to Macs
  --verified-headers  Enable a tenant-confirmed alternate profile mapping
  --verified-version  Use a profile's locally confirmed version field
  --verified-build    Use a profile's locally confirmed build field
  --app-plists FILE   Optional approved Info.plist paths on the source Mac

Profiles: ${formats.join(', ')}
`;

const stringFlags = [
  'format', 'review', 'approved', 'wire', 'output-dir', 'local-report', 'cohort', 'target-macos',
  'native-evidence', 'encoding', 'delimiter', 'columns', 'app-plists',
];
const booleanFlags = [
  'help', 'dry-run', 'emit', 'lookup', 'mac-only', 'verified-headers', 'verified-version', 'verified-build',
];
const flagSpec = Object.fromEntries([
  ...stringFlags.map(flag => [flag, { type: 'string' }]),
  ...booleanFlags.map(flag => [flag, { type: 'boolean' }]),
]);
const delimiters = new Map([['comma', ','], ['tab', '\t'], ['semicolon', ';']]);
const json = value => JSON.stringify(value, null, 2) + '\n';

async function fileBytes(path, label) {
  try {
    return await readFile(path);
  } catch {
    throw new Error(`Could not read the ${label} file.`);
  }
}

async function writePrivate(path, content, label) {
  try {
    await writeFile(path, content, { flag: 'wx', mode: 0o600 });
  } catch {
    throw new Error(`Could not create the ${label} file. Use a new path in a writable directory.`);
  }
}

async function readLocalJson(path, label) {
  return readJson(decode(await fileBytes(path, label)));
}

async function approvedAppPlists(path) {
  if (process.platform !== 'darwin') throw new Error('App plist enrichment runs on the source Mac only.');
  const paths = await readLocalJson(path, 'app plist approval');
  if (!Array.isArray(paths) || paths.some(value =>
    typeof value !== 'string' || !isAbsolute(value) || !value.endsWith('.app/Contents/Info.plist'))) {
    throw new Error('App plist approval must list absolute paths to app Info.plist files.');
  }
  const entries = new Map();
  for (const path of paths) {
    try {
      const { stdout } = await promisify(execFile)('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', '--', path], {
        timeout: 5_000, maxBuffer: 4 * 1024 * 1024,
      });
      entries.set(path.slice(0, -'/Contents/Info.plist'.length), parsePlist(stdout));
    } catch {
      throw new Error('Could not read or decode an approved app Info.plist.');
    }
  }
  return entries;
}

async function emit(batches, wire, dir, stdout) {
  const content = batch => wire === 'csv' ? batch.args.csv : json(batch.args);
  if (!dir) {
    if (batches.length > 1) throw new Error('This inventory needs multiple batches. Use --output-dir to export them individually.');
    if (batches[0]) stdout(content(batches[0]));
    return;
  }
  try {
    await mkdir(dir, { mode: 0o700 });
  } catch {
    throw new Error('Could not create output directory. Use a new directory.');
  }
  for (const [index, batch] of batches.entries()) {
    const file = 'batch-' + String(index + 1).padStart(3, '0') + (wire === 'csv' ? '.csv' : '.json');
    await writePrivate(join(dir, file), content(batch), 'batch');
  }
}

export async function run(argv, { stdout = value => process.stdout.write(value), fetchImpl = fetch } = {}) {
  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({ args: argv, options: flagSpec, allowPositionals: true }));
  } catch {
    throw new Error('Invalid importer arguments. See --help.');
  }
  if (values.help) {
    stdout(help);
    return;
  }
  const format = values.format;
  if (!formats.includes(format) || positionals.length !== 1 ||
      [values.review, values['dry-run'], values.emit, values.lookup].filter(Boolean).length !== 1) {
    throw new Error('Specify one supported --format, one mode and one input file. See --help.');
  }
  const wire = values.wire ?? 'rows';
  const delimiter = delimiters.get(values.delimiter);
  const target = values['target-macos'] === undefined ? undefined : Number(values['target-macos']);
  if (!['csv', 'rows'].includes(wire) || (values.delimiter && !delimiter) ||
      (target !== undefined && ![26, 27, 28].includes(target))) {
    throw new Error('Invalid wire format, delimiter or target macOS. See --help.');
  }
  if ((!values.review && !values.approved) || (values['output-dir'] && !values.emit) ||
      (values['native-evidence'] && !values.lookup) ||
      (values['app-plists'] && !format.startsWith('system-profiler-'))) {
    throw new Error('Missing approval or misplaced mode option. See --help.');
  }

  const bytes = await fileBytes(positionals[0], 'inventory');
  const parsed = parseInventory(format, decode(bytes, values.encoding), {
    delimiter,
    macOnly: values['mac-only'],
    verifiedHeaders: values['verified-headers'],
    verifiedVersion: values['verified-version'],
    verifiedBuild: values['verified-build'],
    columns: values.columns && await readLocalJson(values.columns, 'column map'),
    appPlists: values['app-plists'] && await approvedAppPlists(values['app-plists']),
  });
  const inventory = groupInventory(parsed, format, values.cohort);
  if (values['local-report']) await writePrivate(values['local-report'], json(inventory), 'local report');
  if (values.review) {
    const rows = inventory.groups.filter(group => group.lookup_eligible).map(group => group.row);
    await writePrivate(values.review, json(rows), 'review');
    return;
  }

  const approved = await readLocalJson(values.approved, 'approved tuples');
  const groups = approvedGroups(inventory.groups, approved);
  const batches = batchInventory(groups, { wire, target });
  if (values['dry-run']) {
    for (const [index, batch] of batches.entries()) {
      stdout(JSON.stringify(requestBody(batch.args, index + 1)) + '\n');
    }
    return;
  }
  if (values.emit) {
    await emit(batches, wire, values['output-dir'], stdout);
    return;
  }

  const evidence = values['native-evidence']
    ? nativeEvidence(await readLocalJson(values['native-evidence'], 'native evidence'), groups) : undefined;
  const results = await lookupBatches(batches, { fetchImpl, evidence });
  stdout(json({
    source: format,
    ...(values.cohort ? { cohort: values.cohort } : {}),
    checked: results.length,
    skipped: inventory.groups.length - groups.length,
    unresolved: inventory.unresolved,
    results,
  }));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  run(process.argv.slice(2)).catch(error => {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  });
}

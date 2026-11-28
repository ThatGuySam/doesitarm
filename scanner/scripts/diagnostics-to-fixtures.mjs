#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const [, , input, requestedOutput] = process.argv;
if (!input || process.argv.length > 4) {
  console.error('Usage: node scanner/scripts/diagnostics-to-fixtures.mjs <diagnostics.json|ndjson|ndjson.gz> [fixture-output-directory]');
  process.exit(2);
}

const output = resolve(requestedOutput ??
  fileURLToPath(new URL('../fixtures/bigfolder/', import.meta.url)));

async function* failures(file) {
  const gzip = file.toLowerCase().endsWith('.ndjson.gz');
  if (!gzip && !file.toLowerCase().endsWith('.ndjson')) {
    const document = JSON.parse(await readFile(file, 'utf8'));
    if (!Array.isArray(document.results)) throw new Error('Expected a diagnostics results array.');
    for (const row of document.results) if (row.reproduction) yield row;
    return;
  }
  const source = createReadStream(file);
  const input = gzip ? source.pipe(createGunzip()) : source;
  if (gzip) source.on('error', (error) => input.destroy(error));
  const lines = createInterface({ input, crlfDelay: Infinity });
  let header;
  for await (const line of lines) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line);
    if (!header) {
      if (entry.type !== 'run') throw new Error('Expected the run header on the first NDJSON line.');
      header = entry;
    } else if (entry.type === 'result' && entry.result?.reproduction) {
      yield entry.result;
    }
  }
}

function parts(relative) {
  if (typeof relative !== 'string' || !relative) throw new Error('Expected a relative nonempty path.');
  const segments = relative.split('/');
  if (segments.some((part) => !part || part === '.' || part === '..' || /[\\\u0000]/.test(part))) {
    throw new Error(`Unsafe fixture path ${JSON.stringify(relative)}.`);
  }
  return segments;
}

const escaping = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' };
const escapeXML = (value) => value.replace(/[<>&"']/g, (char) => escaping[char]);
const hexBytes = (hex) => /^(?:[0-9a-f]{2})*$/i.test(hex) ? Buffer.from(hex, 'hex') : null;

function plist(value) {
  if (typeof value === 'string') return `<string>${escapeXML(value)}</string>`;
  if (typeof value === 'boolean') return value ? '<true/>' : '<false/>';
  if (typeof value === 'number') return Number.isSafeInteger(value) ? `<integer>${value}</integer>` : `<real>${value}</real>`;
  if (Array.isArray(value)) return `<array>${value.map(plist).join('')}</array>`;
  if (!value || typeof value !== 'object') throw new Error('Unsupported plist JSON value.');

  if (typeof value.value === 'string' && Object.keys(value).length === 2) {
    switch (value.$plist) {
      case 'integer': return `<integer>${escapeXML(value.value)}</integer>`;
      case 'real': return `<real>${escapeXML(value.value)}</real>`;
      case 'date': return `<date>${escapeXML(value.value)}</date>`;
      case 'data_hex': {
        const data = hexBytes(value.value);
        if (!data) throw new Error('Invalid plist data hex.');
        return `<data>${data.toString('base64')}</data>`;
      }
      case 'uid': return `<dict><key>CF$UID</key><integer>${escapeXML(value.value)}</integer></dict>`;
    }
  }
  const entries = Object.entries(value).map(([key, entry]) => `<key>${escapeXML(key)}</key>${plist(entry)}`);
  return `<dict>${entries.join('')}</dict>`;
}

async function put(path, payload) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, payload, { flag: 'wx' });
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function skeleton(row) {
  const rel = parts(row.display_path);
  const leaf = rel.at(-1);
  const slug = leaf.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 65) || 'scan';
  const suffix = createHash('sha256').update(row.display_path).update(String(row.id)).digest('hex').slice(0, 10);
  const folder = resolve(output, `diagnostic-${slug}-${suffix}`);
  try {
    await mkdir(folder);
  } catch (error) {
    if (error.code === 'EEXIST') return null;
    throw error;
  }
  const relative = `source/${rel.join('/')}`;
  const root = resolve(folder, ...parts(relative));
  const isBundle = row.format === 'app' || /\.app$/i.test(leaf);
  if (isBundle) await mkdir(root, { recursive: true });

  const notes = [];
  if (isBundle && row.info_plist != null && row.info_plist_path) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">${plist(row.info_plist)}</plist>\n`;
    await put(resolve(root, ...parts(row.info_plist_path)),
      row.info_plist_encoding === 'xml_bom' ? `\uFEFF${xml}` : xml);
    if (row.info_plist_encoding === 'binary') notes.push('The captured property list is reconstructed as XML.');
  } else if (isBundle && row.info_plist_path) {
    notes.push('Copy the original Info.plist to reproduce the parse failure.');
  }
  for (const entry of row.directory_listings?.contents?.entries ?? []) {
    if (entry.type === 'directory' && typeof entry.name === 'string' && !entry.name.includes('/')) {
      await mkdir(resolve(root, 'Contents', ...parts(entry.name)), { recursive: true });
    }
  }
  for (const path of row.nested_artifacts ?? []) {
    if (typeof path === 'string' && path.startsWith(`${row.display_path}/`) && /\.app$/i.test(path)) {
      await mkdir(resolve(root, ...parts(path.slice(row.display_path.length + 1))), { recursive: true });
    }
  }

  const prefix = typeof row.executable_prefix_hex === 'string' && row.executable_prefix_hex.length <= 128
    ? hexBytes(row.executable_prefix_hex) : null;
  if (prefix && (isBundle || row.format === 'macho')) {
    if (!isBundle) await put(root, prefix);
    else if (row.executable_path?.startsWith(`${row.display_path}/`)) {
      await put(resolve(root, ...parts(row.executable_path.slice(row.display_path.length + 1))), prefix);
    }
    if ((row.executable_size ?? row.total_size) > prefix.length) {
      notes.push('The executable is a prefix stub. Copy the original binary when its full contents are required.');
    }
  } else if (!isBundle) {
    await put(root, '');
    notes.push('The original container or file must be copied for exact reproduction.');
  }

  const argv = ['scan-cli', 'scan', relative, '--profile', 'local', '--json'];
  await put(resolve(folder, 'repro.json'), JSON.stringify({ argv, expected_status: row.status, original: row.reproduction }, null, 2) + '\n');
  await put(resolve(folder, 'diagnostic.json'), JSON.stringify(row, null, 2) + '\n');
  await put(resolve(folder, 'README.md'), [
    '# Local scan reproduction', '',
    `Input ${JSON.stringify(row.display_path)}`, '',
    `Expected original status \`${row.status}\` (${row.error_class ?? 'unclassified'}).`, '',
    'Run from this directory.', '', '```sh', argv.map(shellQuote).join(' '), '```', '',
    ...notes.map((note) => `- ${note}`), '',
    'Original paths and required files are recorded in repro.json. The skeleton reflects only the evidence present in the export.', '',
  ].join('\n'));
  return folder;
}

await mkdir(output, { recursive: true });
let created = 0;
let existing = 0;
for await (const row of failures(input)) {
  const folder = await skeleton(row);
  if (folder) {
    console.log(basename(folder));
    created += 1;
  } else existing += 1;
}
console.log(`Created ${created} fixture skeletons. ${existing} already existed.`);

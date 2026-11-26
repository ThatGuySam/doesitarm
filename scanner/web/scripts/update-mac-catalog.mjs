import { readFileSync, writeFileSync } from 'node:fs';

const source = 'https://api.doesitarm.com/app-list-searchable.json';
const input = process.argv[2];
const raw = input ? readFileSync(input, 'utf8') : await (async () => {
  const response = await fetch(source, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Catalog returned HTTP ${response.status}`);
  return response.text();
})();
const [header, ...rows] = JSON.parse(raw);
const [nameAt, textAt, pathAt] = ['name', 'text', 'endpoint'].map((key) => header.indexOf(key));
if ([nameAt, textAt, pathAt].includes(-1)) throw new Error('Unexpected searchable-list schema.');
const statuses = new Map([['✅', 'native'], ['✳', 'rosetta'], ['🚫', 'unsupported']]);
const catalog = rows.flatMap((row) => {
  const [name, text, path] = [row[nameAt], row[textAt], row[pathAt]];
  if (typeof name !== 'string' || !/^\/app\/[a-z0-9][a-z0-9-]*$/.test(path)) return [];
  return [[name, path, statuses.get(Array.from(String(text).trim())[0]) ?? 'unknown']];
});
if (catalog.length < 1000) throw new Error('Catalog is incomplete.');
catalog.sort((a, b) => a[1] < b[1] ? -1 : Number(a[1] > b[1]));
writeFileSync(new URL('../public/mac-catalog.json', import.meta.url), `[\n${catalog.map((row) => JSON.stringify(row)).join(',\n')}\n]\n`);

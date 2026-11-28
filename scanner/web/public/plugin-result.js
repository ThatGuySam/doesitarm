import { pluginFormats } from './bundle-kind.js';

export function pluginVerdict(result) {
  if (result.status !== 'complete' || result.architectures.some((slice) => !slice.header_verified)) return 'unknown';
  const names = new Set(result.architectures.map(({ name }) => name));
  const arm = names.has('arm64') || names.has('arm64e');
  const intel = names.has('x86_64') || names.has('x86_64h');
  if (arm) return intel ? 'universal' : 'native';
  if (intel) return 'intel-only';
  return ['i386', 'ppc', 'ppc64'].some((name) => names.has(name)) ? 'legacy' : 'unknown';
}

function publicString(value) {
  if (typeof value !== 'string') return null;
  // Remove path-like values even when they came from the bundle's own metadata.
  const segments = value.replaceAll(/%2f/gi, '/').replaceAll(/%5c/gi, '\\').replaceAll(/%3a/gi, ':');
  if (/(?:^|[\s"'=(~:])[/\\]|[A-Za-z]:[/\\]|(?:^|[/\\])(?:Users|home)[/\\]/i.test(segments)) return null;
  return value || null;
}

export function pluginRow(row) {
  const { result } = row;
  const module = result.vst3_module_info;
  return {
    name: publicString(result.name) ?? publicString(row.label?.split('/').at(-1)),
    version: publicString(result.version),
    bundle_id: publicString(result.bundle_id),
    format: pluginFormats.get(result.format ?? row.format) ?? null,
    architectures: result.architectures.map(({ name, cpu_type, cpu_subtype, header_verified }) => ({
      name, cpu_type, cpu_subtype, header_verified,
    })),
    verdict: pluginVerdict(result),
    status: result.status,
    error: result.status === 'canceled' ? 'Scan canceled.' :
      publicString(result.error) ?? (result.error ? 'The plug-in scan could not finish.' : null),
    ...(result.audio_components?.length ? {
      audio_components: result.audio_components.map(({ name, type, subtype, manufacturer, version }) => ({
        name: publicString(name), type: publicString(type), subtype: publicString(subtype),
        manufacturer: publicString(manufacturer), version,
      })),
    } : {}),
    ...(module ? {
      vst3_module_info: {
        name: publicString(module.name), version: publicString(module.version),
        classes: module.classes.map(({ id, name, category, version }) => ({
          id: publicString(id), name: publicString(name), category: publicString(category), version: publicString(version),
        })),
        compatibility: module.compatibility.map(({ new: id, old }) => ({
          new: publicString(id), old: old.map(publicString).filter(Boolean),
        })),
      },
    } : {}),
    ...(result.module_info_error ? { module_info_error: publicString(result.module_info_error) } : {}),
  };
}

const verdictLabels = {
  universal: 'Universal', native: 'Apple Silicon', 'intel-only': 'Intel only', legacy: 'Legacy', unknown: 'Unknown',
};

export const pluginTableRows = {
  create() {
    const el = document.createElement('tr');
    const heading = document.createElement('th');
    heading.scope = 'row';
    const cells = [heading, ...Array.from({ length: 4 }, () => document.createElement('td'))];
    el.append(...cells);
    return { el, cells };
  },
  patch(row, { cells }) {
    const { name, version, format, verdict, error } = row.result ? pluginRow(row) : {};
    const values = [name ?? row.label.split('/').at(-1), version, format ?? pluginFormats.get(row.format),
      verdictLabels[verdict], error ?? (row.status === 'complete' ? 'Complete' : row.status.replaceAll('_', ' '))];
    cells.forEach((cell, index) => { cell.textContent = values[index] ?? '—'; });
  },
};

const csvColumns = ['name', 'version', 'bundle_id', 'format', 'architectures', 'verdict', 'status', 'error'];

function csvCell(value) {
  let text = String(value ?? '');
  // Spreadsheet importers can evaluate quoted cells as formulas.
  if (/^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function pluginExport(rows, format, pause) {
  const json = format === 'json';
  const parts = [json ? '[\n' : `${csvColumns.join(',')}\r\n`];
  let separator = '';
  for (const row of rows) {
    const record = pluginRow(row);
    if (json) {
      parts.push(separator, JSON.stringify(record));
      separator = ',\n';
    } else {
      const architectures = record.architectures.map(({ name, header_verified }) =>
        header_verified ? name : `${name} (unverified)`).join('; ');
      parts.push(csvColumns.map((key) => csvCell(key === 'architectures' ? architectures : record[key])).join(','), '\r\n');
    }
    const wait = pause?.();
    if (wait) await wait;
  }
  if (json) parts.push('\n]\n');
  return new Blob(parts, { type: json ? 'application/json' : 'text/csv;charset=utf-8' });
}

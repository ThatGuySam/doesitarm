import { publicFields } from './formats.mjs';

const fieldLimits = { name: 160, bundle_id: 255, version: 80, build: 80, publisher: 160 };
export const normalizedName = value => (value ?? '').normalize('NFKC').trim().replace(/\.app$/i, '').replace(/\s+/g, ' ').trim().toLowerCase();

export function publicRow(input) {
  const row = {};
  for (const field of publicFields) {
    const value = input[field];
    if (value == null) continue;
    if (typeof value !== 'string') return null;
    if (value.trim().length > fieldLimits[field]) return null;
    if (value.trim()) row[field] = value.trim();
  }
  return row.name || row.bundle_id ? row : null;
}

function tupleKey(row) {
  const identity = row.bundle_id ? ['id', row.bundle_id.toLowerCase()]
    : ['name', normalizedName(row.name), normalizedName(row.publisher)];
  return JSON.stringify([identity, row.version ?? '', row.build ?? '']);
}

const architectureKinds = new Map([
  ['arch_arm_i64', 'universal'], ['universal 2', 'universal'],
  ['arch_i64', 'intel'], ['intel 64-bit', 'intel'], ['arch_i386', 'intel'], ['intel 32-bit', 'intel'],
  ['arch_arm', 'apple_silicon'], ['apple silicon', 'apple_silicon'],
  ['arch_ios', 'ios'], ['arch_other', 'other'], ['arch_web', 'web'],
]);
const outsideMac = new Set(['ios', 'other', 'web']);

function count(records) {
  const devices = new Set(records.map(record => record.device).filter(Boolean));
  const labels = new Set(records.map(record => record.label).filter(Boolean));
  if (records.every(record => record.device)) return { kind: 'distinct_devices', count: devices.size };
  if (records.every(record => record.label)) return { kind: 'provisional_labels', count: labels.size };
  const reported = records.filter(record => record.sourceCount !== null);
  if (reported.length === records.length) {
    return { kind: 'provider_reported', count: reported.length === 1 ? reported[0].sourceCount : null };
  }
  // A partial ID or label population cannot make a reliable device estimate.
  return { kind: 'rows', count: records.length };
}

export function groupInventory({ records, unresolved }, source, cohort) {
  const groups = new Map();
  const issues = [...unresolved];
  for (const record of records) {
    const row = publicRow(record.row);
    if (!row) {
      issues.push({ row: record.ref, reason: 'invalid_app_fields' });
      continue;
    }
    const key = tupleKey(row);
    if (!groups.has(key)) groups.set(key, { row, records: [] });
    groups.get(key).records.push(record);
  }
  return {
    source,
    ...(cohort ? { cohort } : {}),
    unresolved: issues.sort((a, b) => a.row - b.row),
    groups: [...groups.values()].map(({ row, records: installs }) => {
      const architectures = new Map();
      for (const record of installs) {
        const kind = architectureKinds.get(record.architecture.toLowerCase()) ?? 'unknown';
        if (!architectures.has(kind)) architectures.set(kind, []);
        architectures.get(kind).push(record);
      }
      const sourceCounts = installs.filter(record => record.sourceCount !== null)
        .map(record => ({ row: record.ref, count: record.sourceCount }));
      const fetchedAt = [...new Set(installs.map(record => record.fetchedAt).filter(Boolean))].sort();
      return {
        row,
        identity_confidence: row.bundle_id ? 'bundle_id' : 'name_publisher',
        devices: count(installs),
        architecture: Object.fromEntries([...architectures].map(([kind, subset]) => [kind, count(subset)])),
        lookup_eligible: [...architectures.keys()].some(kind => !outsideMac.has(kind)),
        source_rows: installs.map(record => record.ref),
        ...(sourceCounts.length ? { source_counts: sourceCounts } : {}),
        ...(fetchedAt.length ? { fetched_at: fetchedAt } : {}),
      };
    }),
  };
}

function exactKey(row) {
  return JSON.stringify(row);
}

function checkedRow(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !publicFields.includes(key))) {
    throw new Error('Expected app records with only name, bundle_id, version, build and publisher.');
  }
  const row = publicRow(input);
  if (!row) throw new Error('An app record is missing its identity or has an invalid field.');
  return row;
}

export function approvedGroups(groups, approved) {
  if (!Array.isArray(approved)) throw new Error('Approval must be a JSON array of reviewed app tuples.');
  const allowlist = new Set(approved.map(row => exactKey(checkedRow(row))));
  const selected = groups.filter(group => group.lookup_eligible && allowlist.has(exactKey(group.row)));
  if (selected.length !== allowlist.size) {
    throw new Error('An approved tuple has no exact, eligible match in this inventory. Create a fresh review file.');
  }
  return selected;
}

function httpsUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch {
    return null;
  }
  return null;
}

export function nativeEvidence(entries, groups) {
  if (!Array.isArray(entries)) throw new Error('Native evidence must be a JSON array.');
  const eligible = new Set(groups.map(group => exactKey(group.row)));
  const result = new Map();
  for (const entry of entries) {
    const installed = checkedRow(entry?.installed);
    const key = exactKey(installed);
    const {
      status, candidate_version, candidate_build = null, architectures, channel = null,
      source_url, evidence_basis, minimum_macos = null,
    } = entry;
    const versionMatches = candidate_version === installed.version;
    const optionalText = value => value === null || (typeof value === 'string' && value.trim() !== '');
    if (result.has(key) || !eligible.has(key) || !installed.version ||
        typeof candidate_version !== 'string' || !candidate_version.trim() ||
        !['native_version_available', 'same_version_native_variant'].includes(status) ||
        (status === 'same_version_native_variant') !== versionMatches ||
        !Array.isArray(architectures) || !architectures.every(value => ['arm64', 'arm64e', 'x86_64', 'i386'].includes(value)) ||
        !architectures.some(value => value.startsWith('arm')) ||
        !['vendor', 'binary_architecture'].includes(evidence_basis) || !httpsUrl(source_url) ||
        ![candidate_build, channel, minimum_macos].every(optionalText)) {
      throw new Error('Invalid or unmatched native evidence. Check the version, architecture and source URL.');
    }
    result.set(key, {
      status, candidate_version, candidate_build, architectures, channel,
      source_url: httpsUrl(source_url), evidence_basis, minimum_macos,
    });
  }
  return result;
}

function observedNativeVariant(row, finding) {
  const evidence = finding.evidence;
  if (row.version && finding.status === 'native' && evidence?.basis === 'binary_architecture' &&
      row.version === evidence.observed_version && evidence.architectures?.some(arch => /^arm64/i.test(arch)) &&
      httpsUrl(evidence.source_url)) {
    return {
      status: 'same_version_native_variant',
      candidate_version: row.version,
      candidate_build: evidence.observed_build ?? null,
      architectures: evidence.architectures,
      channel: null,
      source_url: httpsUrl(evidence.source_url),
      evidence_basis: 'binary_architecture',
      minimum_macos: null,
    };
  }
  return {
    status: 'unknown', candidate_version: null, candidate_build: null, architectures: [], channel: null,
    source_url: null, evidence_basis: null, minimum_macos: null,
  };
}

export function joinedResult(group, finding, revision, evidence) {
  const { row, architecture, ...local } = group;
  const catalogNativeClaim = finding.evidence?.basis === 'catalog_statement';
  const uncertain = Object.keys(architecture).some(kind => kind !== 'universal' && kind !== 'apple_silicon');
  // A public result cannot identify the variant on a device with contrary local evidence.
  const status = finding.status === 'native' &&
    Object.keys(architecture).some(kind => kind === 'intel' || outsideMac.has(kind)) ? 'unknown' : finding.status;
  return {
    app: row.name ?? row.bundle_id,
    version: row.version ?? null,
    build: row.build ?? null,
    status,
    native_as_of: catalogNativeClaim ? finding.evidence.observed_version : null,
    link: httpsUrl(finding.catalog_hint?.url ?? finding.evidence?.source_url),
    catalog_status: finding.status,
    unknown_reason: status !== finding.status ? 'local_architecture_differs' : finding.unknown_reason,
    target_assessment: status !== finding.status && finding.target_assessment ? 'unknown' : finding.target_assessment,
    catalog_revision: revision,
    catalog_hint: finding.catalog_hint,
    catalog_candidates: finding.candidates,
    architecture,
    ...(uncertain ? { native_availability: evidence.get(exactKey(row)) ?? observedNativeVariant(row, finding) } : {}),
    ...local,
  };
}

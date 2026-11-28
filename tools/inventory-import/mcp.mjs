import { publicFields } from './formats.mjs';
import { joinedResult, normalizedName } from './inventory.mjs';

export const endpoint = 'https://mcp.doesitarm.com/mcp';
const maxRows = 250;
const maxInputBytes = 64 * 1024;
const maxArgumentsBytes = 96 * 1024;
const maxRevisionLength = 128;
const maxDetailLookups = 25;
const pageLimit = 50;
const statuses = ['native', 'rosetta', 'unsupported', 'unknown'];
const bytes = value => Buffer.byteLength(value, 'utf8');

function csv(rows) {
  const cell = value => /[",\r\n]/.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value;
  return [publicFields.join(','), ...rows.map(row => publicFields.map(field => cell(row[field] ?? '')).join(','))].join('\n');
}

function argumentsFor(rows, wire, target) {
  return { ...(wire === 'csv' ? { csv: csv(rows) } : { rows }), ...(target ? { target_macos: target } : {}), limit: pageLimit };
}

function fits(args) {
  const input = args.csv ?? JSON.stringify(args.rows);
  // Reserve later-page space, including worst-case JSON escaping of the revision.
  const paged = { ...args, offset: maxRows - 1, catalog_revision: '\u0001'.repeat(maxRevisionLength) };
  return bytes(input) <= maxInputBytes && bytes(JSON.stringify(paged)) <= maxArgumentsBytes;
}

function serverKey({ bundle_id, name, publisher, version, build }) {
  const identity = bundle_id ? 'id:' + bundle_id.toLowerCase() : 'name:' + normalizedName(name) + '|' + normalizedName(publisher);
  return [identity, version ?? '', build ?? ''].join('|');
}

export function batchInventory(groups, { wire = 'rows', target } = {}) {
  const batches = [];
  let current = [];
  let bundleIds = new Set();
  let keys = new Set();
  const addBatch = () => {
    if (current.length) batches.push({ groups: current, args: argumentsFor(current.map(group => group.row), wire, target) });
    current = [];
    bundleIds = new Set();
    keys = new Set();
  };
  for (const group of groups) {
    const bundleId = group.row.bundle_id?.toLowerCase();
    const key = serverKey(group.row);
    const needsDetails = bundleId && !bundleIds.has(bundleId) && bundleIds.size === maxDetailLookups;
    const next = argumentsFor([...current.map(item => item.row), group.row], wire, target);
    if (current.length === maxRows || needsDetails || keys.has(key) || !fits(next)) addBatch();
    if (!current.length && !fits(argumentsFor([group.row], wire, target))) throw new Error('One tuple exceeds the MCP byte limits.');
    current.push(group);
    keys.add(key);
    if (bundleId) bundleIds.add(bundleId);
  }
  addBatch();
  return batches;
}

export function requestBody(args, batchNumber, offset = 0, revision) {
  return {
    jsonrpc: '2.0',
    id: `${batchNumber}:${offset}`,
    method: 'tools/call',
    params: {
      name: 'check_inventory',
      arguments: { ...args, ...(offset ? { offset, catalog_revision: revision } : {}) },
    },
  };
}

class RevisionChanged extends Error {}

async function fetchPage(fetchImpl, body) {
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2025-11-25',
      },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error('Could not reach the Does It ARM MCP endpoint.');
  }
  if (!response.ok) {
    throw new Error(response.status === 429 ? 'Does It ARM rate limit reached. Wait a minute before retrying.'
      : `Does It ARM MCP returned HTTP ${response.status}.`);
  }
  let rpc;
  try {
    rpc = await response.json();
  } catch {
    throw new Error('Does It ARM MCP did not return JSON.');
  }
  if (rpc?.jsonrpc !== '2.0' || rpc.id !== body.id) throw new Error('Invalid JSON-RPC response from Does It ARM MCP.');
  const result = rpc.result;
  if (result?.isError && result.content?.some(item => typeof item.text === 'string' &&
    item.text.startsWith('catalog_revision no longer matches'))) {
    throw new RevisionChanged();
  }
  if (rpc.error || result?.isError || !result?.structuredContent) {
    throw new Error('Does It ARM MCP rejected the lookup or returned no structured result.');
  }
  return result.structuredContent;
}

async function readBatch(batch, number, fetchImpl, evidence) {
  const results = [];
  let offset = 0;
  let revision;
  do {
    const data = await fetchPage(fetchImpl, requestBody(batch.args, number, offset, revision));
    if (typeof data.catalog_revision !== 'string' || !data.catalog_revision ||
        data.catalog_revision.length > maxRevisionLength) {
      throw new Error('Invalid Does It ARM catalog revision.');
    }
    if (revision && data.catalog_revision !== revision) throw new RevisionChanged();
    revision = data.catalog_revision;
    const total = batch.groups.length;
    if (data.counts?.unique !== total || data.counts?.invalid !== 0 ||
        !Array.isArray(data.results) || data.results.length !== Math.min(pageLimit, total - offset)) {
      throw new Error('The response does not match the submitted batch.');
    }
    for (const [index, finding] of data.results.entries()) {
      if (finding?.row !== offset + index + 1 || !statuses.includes(finding.status)) {
        throw new Error('An MCP result has an invalid row number or status.');
      }
      results.push(joinedResult(batch.groups[finding.row - 1], finding, revision, evidence));
    }
    const next = offset + data.results.length < total ? offset + data.results.length : null;
    if (data.next_offset !== next) throw new Error('The MCP result has an invalid next offset.');
    offset = next;
  } while (offset !== null);
  return results;
}

export async function lookupBatches(batches, { fetchImpl = fetch, evidence = new Map() } = {}) {
  const results = [];
  for (const [index, batch] of batches.entries()) {
    try {
      try {
        results.push(...await readBatch(batch, index + 1, fetchImpl, evidence));
      } catch (error) {
        if (!(error instanceof RevisionChanged)) throw error;
        results.push(...await readBatch(batch, index + 1, fetchImpl, evidence));
      }
    } catch (error) {
      const problem = error instanceof RevisionChanged ? 'The catalog changed twice during pagination.' : error.message;
      throw new Error(`Batch ${index + 1} of ${batches.length}: ${problem}`);
    }
  }
  return results;
}

import { stringifyRedacted } from './path-privacy.js';

const DATABASE = 'scanner-folder-runs';
const MAX_ROW_BYTES = 256 * 1024;
const MAX_DETAIL_BYTES = 48 * 1024 * 1024;
const READ_BATCH = 16;
let connection;

function database() {
  if (!connection) {
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('runs', { keyPath: 'id' });
        request.result.createObjectStore('rows', { keyPath: ['runId', 'id'] });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          connection = undefined;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Folder storage is blocked by another page.'));
    }).catch((error) => {
      connection = undefined;
      throw error;
    });
  }
  return connection;
}

function completed(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error ?? new Error('Folder storage was interrupted.'));
  });
}

function answer(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function rowRange(runId, after = 0) {
  return IDBKeyRange.bound([runId, after], [runId, Infinity], true);
}

export class FolderJournal {
  id = crypto.randomUUID();
  #detailBytes = 0;

  snapshot(row) {
    const { id, label, kind, format, parentBundlePath, started, ended, source, result,
      evidence, directoryListings, relativeCandidates, nestedArtifacts } = row;
    const base = { id, label, kind, format, parentBundlePath, started, ended, source, result };
    if (this.#detailBytes < MAX_DETAIL_BYTES) {
      const data = stringifyRedacted({ ...base, evidence, directoryListings, relativeCandidates, nestedArtifacts });
      const bytes = data.length * 2;
      if (bytes <= MAX_ROW_BYTES && this.#detailBytes + bytes <= MAX_DETAIL_BYTES) {
        this.#detailBytes += bytes;
        return data;
      }
    }
    const { status, format: resultFormat, architectures, error, error_class, executable_path, executable_size,
      bundle_role, name, bundle_id, version, min_macos, bytes_read, total_size } = result;
    return stringifyRedacted({
      ...base,
      result: { status, format: resultFormat, architectures, error, error_class, executable_path, executable_size,
        bundle_role, name, bundle_id, version, min_macos, bytes_read, total_size },
      evidence: { info_plist_path: evidence?.info_plist_path, info_plist_size: evidence?.info_plist_size },
      diagnosticsTruncated: true,
    });
  }

  async write(header, state, { row, create = false } = {}) {
    const db = await database();
    const transaction = db.transaction(['runs', 'rows'], 'readwrite', { durability: 'strict' });
    const done = completed(transaction);
    const runs = transaction.objectStore('runs');
    const next = { id: this.id, state, header: JSON.parse(stringifyRedacted(header)) };
    if (create) runs.add(next);
    else {
      const previous = runs.get(this.id);
      previous.onsuccess = () => {
        if (!previous.result) {
          transaction.abort();
          return;
        }
        runs.put(next);
        if (row) transaction.objectStore('rows').put({ runId: this.id, ...row });
      };
    }
    await done;
  }

  async row(id) {
    const db = await database();
    const entry = await answer(db.transaction('rows').objectStore('rows').get([this.id, id]));
    return entry && JSON.parse(entry.data);
  }
}

export async function savedFolders() {
  const db = await database();
  const runs = await answer(db.transaction('runs').objectStore('runs').getAll());
  const rows = db.transaction('rows').objectStore('rows');
  const counts = await Promise.all(runs.map(({ id }) => answer(rows.count(rowRange(id)))));
  return runs.map((run, index) => ({ ...run, count: counts[index] }))
    .sort((a, b) => b.header.started_at.localeCompare(a.header.started_at));
}

export async function discardFolder(runId) {
  const db = await database();
  const transaction = db.transaction(['runs', 'rows'], 'readwrite');
  const done = completed(transaction);
  transaction.objectStore('runs').delete(runId);
  transaction.objectStore('rows').delete(rowRange(runId));
  await done;
}

async function* snapshots(runId) {
  const db = await database();
  let after = 0;
  while (true) {
    const rows = await answer(db.transaction('rows').objectStore('rows').getAll(rowRange(runId, after), READ_BATCH));
    if (!rows.length) return;
    for (const row of rows) yield JSON.parse(row.data);
    after = rows.at(-1).id;
  }
}

export async function* savedFolderRows(runId) {
  const members = new Map();
  const childrenOf = (label) => {
    if (!members.has(label)) members.set(label, []);
    return members.get(label);
  };
  // Rebuild only the small index needed for inventories. Detailed evidence is
  // read in batches during export and discarded after it is written.
  for await (const row of snapshots(runId)) {
    if (!row.parentBundlePath) continue;
    const { format, architectures, executable_path } = row.result;
    childrenOf(row.parentBundlePath).push({
      kind: row.kind, label: row.label, ended: row.ended,
      result: { format, architectures, executable_path },
      children: row.kind === 'bundle' ? childrenOf(row.label) : undefined,
    });
  }
  for await (const row of snapshots(runId)) {
    if (row.kind === 'bundle') row.children = members.get(row.label);
    yield row;
  }
}

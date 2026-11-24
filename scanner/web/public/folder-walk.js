const MAX_LISTING = 64;
const SLICE_MS = 8;
const PROBE_BATCH = 64;
const BUNDLE = /\.app$/i;
const ARCHIVE = /\.(?:dmg|zip|pkg|tar(?:\.(?:gz|xz|bz2))?|tgz)$/i;
const MAGIC = new Set([
  0xfeedface, 0xcefaedfe, 0xfeedfacf, 0xcffaedfe,
  0xcafebabe, 0xbebafeca, 0xcafebabf, 0xbfbafeca,
]);

export const yieldToPage = () => globalThis.scheduler?.yield?.() ??
  new Promise((resolve) => setTimeout(resolve, 0));

export function timeSlice() {
  let deadline = performance.now() + SLICE_MS;
  return () => {
    if (performance.now() < deadline) return;
    return yieldToPage().then(() => { deadline = performance.now() + SLICE_MS; });
  };
}

export function folderStats(method) {
  return {
    method, folder_name: null, files_seen: 0, directories_seen: 0,
    skipped_entries: {}, skip_examples: [], skip_examples_truncated: false, symlink_metadata_available: false,
  };
}

export function skipped(stats, reason, path = null) {
  stats.skipped_entries[reason] = (stats.skipped_entries[reason] ?? 0) + 1;
  if (path && stats.skip_examples.length < 64) stats.skip_examples.push({ path, reason });
  else if (path) stats.skip_examples_truncated = true;
}

function skippedError(stats, error, path) {
  skipped(stats, error?.name === 'NotAllowedError' || error?.name === 'SecurityError'
    ? 'permission_denied' : 'unreadable', path);
}

function bundleAt(label, parent, open) {
  return {
    label, parent, open, plist: null, plistPath: null, openPlist: null, entries: new Map(),
    contents: { entries: [], truncated: false },
    macos: { entries: [], truncated: false },
    hasResources: false, nestedArtifacts: [], hasExecutableCandidates: false, artifacts: [],
  };
}

function recordListing(bundle, relative, type, file, getFile) {
  const contents = 'Contents/';
  const macos = 'Contents/MacOS/';
  if (!relative.startsWith(contents)) return;
  const listing = !relative.includes('/', contents.length) ? bundle.contents :
    relative.startsWith(macos) && !relative.includes('/', macos.length) ? bundle.macos : null;
  if (!listing) return;
  if (listing.entries.length >= MAX_LISTING) {
    listing.truncated = true;
    return;
  }
  listing.entries.push({
    name: relative.slice(relative.lastIndexOf('/') + 1), type, size: file?.size ?? null, symlink_target: null, getFile,
  });
}

function bundleEntry(bundle, relative, type, file = null, getFile) {
  recordListing(bundle, relative, type, file, getFile);
  if (relative === 'Contents/Resources' || relative.startsWith('Contents/Resources/')) {
    bundle.hasResources = true;
  }
  if (type !== 'file') return;
  if (relative === 'Contents/Info.plist' || relative === 'Info.plist') {
    if (bundle.plistPath !== 'Contents/Info.plist') {
      bundle.plistPath = relative;
      bundle.plist = file;
      bundle.openPlist = getFile;
    }
    return;
  }
  if (relative.startsWith('Contents/MacOS/')) bundle.hasExecutableCandidates = true;
  if (file && (relative.startsWith('Contents/MacOS/') ||
      !relative.includes('/', relative.startsWith('Contents/') ? 'Contents/'.length : 0))) {
    bundle.entries.set(relative, file);
  }
}

function bundleJob(bundle, stats) {
  const { label, parent, entries, open, plistPath } = bundle;
  const base = label.length + 1;
  const wrapper = bundle.nestedArtifacts.some((path) => BUNDLE.test(path) && path.slice(base).startsWith('Wrapper/'));
  const resources = bundle.hasResources && !bundle.hasExecutableCandidates && !bundle.nestedArtifacts.length;
  return {
    kind: 'bundle', label, size: bundle.plist?.size, parentBundlePath: parent,
    roleHint: wrapper ? 'wrapper' : resources ? 'resource_only' : null,
    plistPath, nestedArtifacts: bundle.nestedArtifacts,
    artifacts: bundle.artifacts,
    relativeCandidates: bundle.macos.entries.filter(({ type }) => type === 'file')
      .map(({ name, size }) => ({ path: `Contents/MacOS/${name}`, size, architectures: [] })),
    async getDirectoryListings() {
      async function listing(value) {
        const entries = await Promise.all(value.entries.map(async ({ getFile, ...entry }) => {
          if (getFile) {
            try {
              entry.size = (await getFile()).size;
            } catch (error) {
              skippedError(stats, error, label);
            }
          }
          return entry;
        }));
        return { entries, truncated: value.truncated };
      }
      const [contents, macos] = await Promise.all([listing(bundle.contents), listing(bundle.macos)]);
      return { contents, macos };
    },
    async getPlist() {
      return bundle.plist ?? await bundle.openPlist?.() ?? null;
    },
    async getExecutable(relative) {
      const file = entries.get(relative) ?? (open ? await open(relative.split('/')) : null);
      if (!file) return null;
      return file;
    },
    recordError: (error) => skippedError(stats, error, label),
  };
}

export function fileJob(file, label = file.name, parentBundlePath = null, probe = false) {
  return { kind: 'file', file, label, parentBundlePath, probe };
}

const worthProbing = (name) => !name.startsWith('._') && name !== '.DS_Store';
const bundlePlist = (relative) => relative === 'Contents/Info.plist' || relative === 'Info.plist';

function discoveryCallbacks({ stats, onJob, onProgress, signal }) {
  const pause = timeSlice();
  let nextUpdate = 0;
  function progress() {
    const now = performance.now();
    if (now >= nextUpdate) {
      nextUpdate = now + 90;
      onProgress?.(stats);
    }
  }
  return {
    check: () => signal?.throwIfAborted(),
    job: onJob,
    pause() {
      const waiting = pause();
      if (waiting) return waiting.then(() => {
        signal?.throwIfAborted();
        progress();
      });
      progress();
    },
  };
}

class Probes {
  #files = [];
  #flow;
  #stats;
  #retainScripts;

  constructor(flow, stats, retainScripts = false) {
    this.#flow = flow;
    this.#stats = stats;
    this.#retainScripts = retainScripts;
  }

  add(getFile, path, parent) {
    this.#files.push({ getFile, path, parent });
    if (this.#files.length >= PROBE_BATCH) return this.drain();
  }

  drain() {
    if (this.#files.length) return this.#readBatch();
  }

  async #readBatch() {
    const batch = this.#files.splice(0);
    const jobs = await Promise.all(batch.map(async ({ getFile, path, parent }) => {
      try {
        const file = await getFile();
        if (!file || file.size < 4) return;
        const magic = await file.slice(0, 4).arrayBuffer();
        if (magic.byteLength !== 4) return;
        const header = new DataView(magic);
        if (MAGIC.has(header.getUint32(0))) return { file, path, parent, executable: true };
        if (parent && this.#retainScripts && header.getUint16(0) === 0x2321) {
          return { file, path, parent, executable: false };
        }
      } catch (error) {
        skippedError(this.#stats, error, path);
      }
    }));
    this.#flow.check();
    for (const hit of jobs) {
      if (!hit) continue;
      const { file, path, parent, executable } = hit;
      if (parent) parent.entries.set(path.slice(parent.label.length + 1), file);
      if (!executable) continue;
      const job = fileJob(file, path, parent?.label, true);
      if (parent) parent.artifacts.push(job);
      else this.#flow.job(job);
    }
  }
}

export async function walkFileList(files, options) {
  const { stats } = options;
  const flow = discoveryCallbacks(options);
  const probes = new Probes(flow, stats, true);
  const bundles = new Map();
  const directories = new Map();
  let previous = '';
  let parent = null;

  const total = files.length;
  for (let i = 0; i < total; i += 1) {
    const file = files[i];
    const path = file.webkitRelativePath || file.name;
    const split = path.lastIndexOf('/');
    const dir = split < 0 ? '' : path.slice(0, split);
    const name = path.slice(split + 1);
    stats.files_seen += 1;
    if (i === 0 && split >= 0) stats.folder_name = path.split('/', 1)[0];

    if (dir !== previous) {
      previous = dir;
      parent = null;
      if (directories.has(dir)) parent = directories.get(dir);
      else {
        let prefix = '';
        for (const part of dir.split('/')) {
          const next = prefix ? `${prefix}/${part}` : part;
          if (directories.has(next)) {
            parent = directories.get(next);
          } else {
            stats.directories_seen += 1;
            if (parent) bundleEntry(parent, next.slice(parent.label.length + 1), 'directory');
            if (BUNDLE.test(part)) {
              const bundle = bundleAt(next, parent?.label ?? null, null);
              parent?.nestedArtifacts.push(next);
              bundles.set(next, bundle);
              parent = bundle;
            }
            directories.set(next, parent);
          }
          prefix = next;
        }
      }
    }

    const relative = parent && path.slice(parent.label.length + 1);
    if (parent) bundleEntry(parent, relative, 'file', file);
    if (ARCHIVE.test(name)) {
      parent?.nestedArtifacts.push(path);
      flow.job(fileJob(file, path, parent?.label));
    } else if (!bundlePlist(relative) && file.size >= 4 && worthProbing(name)) {
      const wait = probes.add(() => file, path, parent);
      if (wait) await wait;
    }
    // Native File.size can obtain filesystem metadata synchronously.
    const wait = flow.pause();
    if (wait) await wait;
  }

  await probes.drain();
  for (const bundle of bundles.values()) {
    flow.check();
    flow.job(bundleJob(bundle, stats));
    const wait = flow.pause();
    if (wait) await wait;
  }
}

function entryFile(entry) {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function entryProbe(entry) {
  if (typeof entry.getMetadata === 'function') {
    const metadata = await new Promise((resolve, reject) => entry.getMetadata(resolve, reject)).catch(() => null);
    if (metadata?.size < 4) return null;
  }
  return entryFile(entry);
}

function entryChild(entry, name, method) {
  return new Promise((resolve, reject) => entry[method](name, {}, resolve, reject));
}

async function* entryChildren(entry) {
  const reader = entry.createReader();
  while (true) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) return;
    yield* batch;
  }
}

const adapters = {
  handle: {
    isDirectory: (entry) => entry.kind === 'directory',
    children: (entry) => entry.values(),
    getFile: (entry) => entry.getFile(),
    async open(entry, parts) {
      for (const part of parts.slice(0, -1)) entry = await entry.getDirectoryHandle(part);
      return (await entry.getFileHandle(parts.at(-1))).getFile();
    },
  },
  entry: {
    isDirectory: (entry) => entry.isDirectory,
    children: entryChildren,
    getFile: entryFile,
    getProbe: entryProbe,
    async open(entry, parts) {
      for (const part of parts.slice(0, -1)) entry = await entryChild(entry, part, 'getDirectory');
      return entryFile(await entryChild(entry, parts.at(-1), 'getFile'));
    },
  },
};

export async function walkDirectory(root, method, options) {
  const { stats } = options;
  const adapter = adapters[method];
  const getProbe = adapter.getProbe ?? adapter.getFile;
  const flow = discoveryCallbacks(options);
  const probes = new Probes(flow, stats);
  const stack = [];
  stats.folder_name ??= root.name;

  async function visit(entry, path, parent, direct) {
    const directory = adapter.isDirectory(entry);
    const relative = parent && path.slice(parent.label.length + 1);
    if (parent) bundleEntry(parent, relative, directory ? 'directory' : 'file', null,
      directory ? undefined : () => adapter.getFile(entry));
    if (!directory) {
      stats.files_seen += 1;
      if (direct || ARCHIVE.test(entry.name)) {
        try {
          flow.job(fileJob(await adapter.getFile(entry), path, parent?.label));
          parent?.nestedArtifacts.push(path);
        } catch (error) {
          skippedError(stats, error, path);
        }
      } else if (!bundlePlist(relative) && worthProbing(entry.name)) {
        const wait = probes.add(() => getProbe(entry), path, parent);
        if (wait) await wait;
      }
      return;
    }

    stats.directories_seen += 1;
    // The APIs do not expose inode or symlink metadata. isSameEntry catches an
    // ancestor alias when the browser exposes one. A depth guard bounds others.
    if (stack.length >= 256) {
      skipped(stats, 'directory_depth_guard', path);
      return;
    }
    if (stack.some((frame) => frame.entry === entry)) {
      skipped(stats, 'symlink_loop', path);
      return;
    }
    // Compare same-name ancestors for the usual loop-through-link layout
    // without an IPC round trip for every directory in the tree.
    if (entry.isSameEntry) {
      for (const frame of stack) {
        if (frame.entry.name === entry.name && await entry.isSameEntry(frame.entry)) {
          skipped(stats, 'symlink_loop', path);
          return;
        }
      }
    }
    let bundle = null;
    if (BUNDLE.test(entry.name)) {
      bundle = bundleAt(path, parent?.label ?? null, (parts) => adapter.open(entry, parts));
      parent?.nestedArtifacts.push(path);
    }
    stack.push({ entry, path, bundle, parent: bundle ?? parent, cursor: adapter.children(entry) });
  }

  await visit(root, root.name, null, true);
  try {
    while (stack.length) {
      flow.check();
      const top = stack.at(-1);
      let step;
      try {
        step = await top.cursor.next();
      } catch (error) {
        skippedError(stats, error, top.path);
      }
      if (step && !step.done) {
        const child = step.value;
        await visit(child, `${top.path}/${child.name}`, top.parent, false);
      } else {
        stack.pop();
        if (top.bundle) {
          const wait = probes.drain();
          if (wait) await wait;
          flow.job(bundleJob(top.bundle, stats));
        }
      }
      const wait = flow.pause();
      if (wait) await wait;
    }
    await probes.drain();
  } finally {
    for (const { cursor } of stack.reverse()) await cursor.return?.();
  }
}

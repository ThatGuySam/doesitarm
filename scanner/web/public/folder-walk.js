import { bundleKind } from './bundle-kind.js';

const MAX_LISTING = 64;
const SLICE_MS = 8;
const PROBE_BATCH = 64;
const MAX_BUNDLE_ARTIFACTS = 1024;
const MAX_NESTED_PATHS = 1024;
const isApp = (path) => bundleKind(path) === 'app';
const ARCHIVE = /\.(?:dmg|zip|pkg|tar(?:\.(?:gz|xz|bz2))?|tgz)$/i;
const MAGIC = new Set([
  0xfeedface, 0xcefaedfe, 0xfeedfacf, 0xcffaedfe,
  0xcafebabe, 0xbebafeca, 0xcafebabf, 0xbfbafeca,
]);

export class FolderLimitError extends Error {}

// Leave headroom below the successful 300,000-file, 169-bundle run in FFCRASH.md.
export const FOLDER_CRASH_GUARD = Object.freeze({ entries: 100_000, appBundles: 100 });

export class FolderCrashGuardError extends Error {
  constructor(limit, units) {
    super('The browser crash guard stopped folder discovery.');
    this.limit = limit;
    this.units = units;
    this.unfinishedApps = 0;
  }
}

export function folderCrashGuard(stats, limits = FOLDER_CRASH_GUARD) {
  let apps = 0;
  return (path, directory) => {
    const app = directory && isApp(path);
    const entries = stats.files_seen + stats.directories_seen;
    if (entries >= limits.entries || (app && apps >= limits.appBundles)) {
      stats.partial = true;
      skipped(stats, 'browser_crash_guard', path);
      if (entries >= limits.entries) throw new FolderCrashGuardError(limits.entries, 'files and folders');
      throw new FolderCrashGuardError(limits.appBundles, 'app bundles');
    }
    if (app) apps += 1;
  };
}

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
    method, folder_name: null, roots: [], files_seen: 0, directories_seen: 0,
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

// These are only the roots the browser actually delivered.
export function recordRoot(stats, name, status) {
  const root = { name, status };
  stats.roots.push(root);
  return root;
}

async function optionalMember(open, paths) {
  for (const path of paths) {
    try {
      const file = await open(path);
      if (file) return { file, path };
    } catch (error) {
      if (error?.name !== 'NotFoundError') throw error;
    }
  }
  return null;
}

const PLUGIN_PLISTS = ['Contents/Info.plist', 'Info.plist'];
const VST3_MODULE_INFO = ['Contents/Resources/moduleinfo.json', 'Contents/moduleinfo.json'];

function pluginJob(label, format, open, stats, parentBundlePath) {
  return {
    kind: 'plugin', label, format, parentBundlePath,
    getPluginPlist: () => optionalMember(open, PLUGIN_PLISTS),
    getModuleInfo: format === 'vst3' ? () => optionalMember(open, VST3_MODULE_INFO) : undefined,
    getExecutable: open,
    recordError: (error) => skippedError(stats, error, label),
  };
}

function opaquePlugin(label, format) {
  return { kind: 'plugin', format, label, opaque: true };
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

function recordNested(bundle, path, stats) {
  if (!bundle) return;
  if (bundle.nestedArtifacts.length < MAX_NESTED_PATHS) bundle.nestedArtifacts.push(path);
  else {
    stats.partial = true;
    skipped(stats, 'nested_path_limit', path);
  }
}

function bundleJob(bundle, stats) {
  const { label, parent, entries, open, plistPath } = bundle;
  const base = label.length + 1;
  const wrapper = bundle.nestedArtifacts.some((path) => isApp(path) && path.slice(base).startsWith('Wrapper/'));
  const resources = bundle.hasResources && !bundle.hasExecutableCandidates && !bundle.nestedArtifacts.length;
  return {
    kind: 'bundle', label, size: bundle.size, parentBundlePath: parent,
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
      const candidate = entries.get(relative);
      const file = typeof candidate === 'function' ? await candidate() : candidate ??
        (open ? await open(relative.split('/')) : null);
      if (!file) return null;
      return file;
    },
    recordError: (error) => skippedError(stats, error, label),
  };
}

export function fileJob(file, label = file.name, parentBundlePath = null, probe = false) {
  const format = bundleKind(label);
  if (format && format !== 'app') return opaquePlugin(label, format);
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
      return onProgress?.(stats);
    }
  }
  return {
    check: () => signal?.throwIfAborted(),
    job: onJob,
    pause() {
      const waiting = pause();
      if (waiting) return waiting.then(() => {
        signal?.throwIfAborted();
        return progress();
      });
      return progress();
    },
  };
}

function rememberArtifact(bundle, job, stats) {
  if (bundle.artifacts.length >= MAX_BUNDLE_ARTIFACTS) {
    stats.partial = true;
    skipped(stats, 'bundle_artifact_limit', job.label);
  } else {
    bundle.artifacts.push(job);
    if (job.openFile) bundle.entries.set(job.label.slice(bundle.label.length + 1), job.openFile);
  }
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

  add(getFile, path, parent, { lazy = false, probe = true, getSize } = {}) {
    this.#files.push({ getFile, path, parent, lazy, probe, getSize });
    if (this.#files.length >= PROBE_BATCH) return this.drain();
  }

  drain() {
    if (this.#files.length) return this.#readBatch();
  }

  async #readBatch() {
    const batch = this.#files.splice(0);
    const jobs = await Promise.all(batch.map(async ({ getFile, path, parent, lazy, probe, getSize }) => {
      try {
        const knownSize = await getSize?.();
        const needsFile = knownSize == null || (probe && knownSize >= 4);
        const file = needsFile ? await getFile() : null;
        const size = file?.size ?? knownSize;
        if (lazy && parent && size != null) parent.size = (parent.size ?? 0) + size;
        if (!probe || !file || size < 4) return;
        const magic = await file.slice(0, 4).arrayBuffer();
        if (magic.byteLength !== 4) return;
        const header = new DataView(magic);
        if (MAGIC.has(header.getUint32(0))) {
          const job = lazy
            ? { kind: 'file', openFile: getFile, size, label: path, parentBundlePath: parent?.label, probe: true }
            : fileJob(file, path, parent?.label, true);
          return { job, parent, file: lazy ? null : file, path };
        }
        if (parent && this.#retainScripts && header.getUint16(0) === 0x2321) {
          return { file, path, parent };
        }
      } catch (error) {
        skippedError(this.#stats, error, path);
      }
    }));
    this.#flow.check();
    for (const hit of jobs) {
      if (!hit) continue;
      const { file, path, parent, job } = hit;
      if (parent && file) parent.entries.set(path.slice(parent.label.length + 1), file);
      if (!job) continue;
      if (parent) rememberArtifact(parent, job, this.#stats);
      else {
        const wait = this.#flow.job(job);
        if (wait) await wait;
      }
    }
  }
}

export async function walkFileList(files, options) {
  const { stats } = options;
  const flow = discoveryCallbacks(options);
  const probes = new Probes(flow, stats, true);
  const bundles = new Map();
  const roots = new Map();
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
    if (split >= 0) {
      const root = path.split('/', 1)[0];
      stats.folder_name ??= root;
      if (!roots.has(root)) roots.set(root, recordRoot(stats, root, 'partial'));
    }

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
            if (parent && !parent.pluginFormat) bundleEntry(parent, next.slice(parent.label.length + 1), 'directory');
            const format = !parent?.pluginFormat && bundleKind(part);
            if (format) {
              const bundle = bundleAt(next, parent?.label ?? null, null);
              if (format !== 'app') bundle.pluginFormat = format;
              recordNested(parent, next, stats);
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
    if (parent?.pluginFormat) {
      if (bundlePlist(relative) || VST3_MODULE_INFO.includes(relative) ||
          /^Contents\/MacOS\/[^/]+$/.test(relative)) parent.entries.set(relative, file);
      const wait = flow.pause();
      if (wait) await wait;
      continue;
    }
    const size = file.size;
    if (parent) {
      parent.size = (parent.size ?? 0) + size;
      bundleEntry(parent, relative, 'file', file);
    }
    const format = bundleKind(name);
    if (ARCHIVE.test(name) || (format && format !== 'app')) {
      recordNested(parent, path, stats);
      const job = fileJob(file, path, parent?.label);
      if (job.opaque && split < 0) recordRoot(stats, name, 'skipped');
      const wait = flow.job(job);
      if (wait) await wait;
    } else if (!bundlePlist(relative) && size >= 4 && worthProbing(name)) {
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
    const job = bundle.pluginFormat
      ? pluginJob(bundle.label, bundle.pluginFormat, (path) => bundle.entries.get(path), stats, bundle.parent)
      : bundleJob(bundle, stats);
    const queued = flow.job(job);
    if (queued) await queued;
    const wait = flow.pause();
    if (wait) await wait;
  }
  if (!stats.skipped_entries.permission_denied && !stats.skipped_entries.unreadable) {
    for (const root of roots.values()) root.status = 'scanned';
  }
}

function entryFile(entry) {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function entryChild(entry, name, method) {
  return new Promise((resolve, reject) => entry[method](name, {}, resolve, reject));
}

async function* entryChildren(entry, frame) {
  const reader = entry.createReader();
  while (true) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) return;
    for (let index = 0; index < batch.length; index += 1) {
      frame.unvisited = batch.length - index - 1;
      yield batch[index];
    }
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
    getSize(entry) {
      if (typeof entry.getMetadata !== 'function') return undefined;
      return new Promise((resolve, reject) => entry.getMetadata(resolve, reject))
        .then((metadata) => metadata.size, () => undefined);
    },
    async open(entry, parts) {
      for (const part of parts.slice(0, -1)) entry = await entryChild(entry, part, 'getDirectory');
      return entryFile(await entryChild(entry, parts.at(-1), 'getFile'));
    },
  },
};

export async function walkDirectory(root, method, options) {
  const { stats, crashGuard } = options;
  const adapter = adapters[method];
  const flow = discoveryCallbacks(options);
  const probes = new Probes(flow, stats);
  const stack = [];
  stats.folder_name ??= root.name;
  const rootRecord = adapter.isDirectory(root) ? recordRoot(stats, root.name, 'skipped') : null;
  const skipCount = () => Object.values(stats.skipped_entries).reduce((sum, count) => sum + count, 0);
  const priorSkips = rootRecord && skipCount();
  let enteredRoot = false;

  async function visit(entry, path, parent, direct) {
    const directory = adapter.isDirectory(entry);
    crashGuard?.(path, directory);
    if (direct) enteredRoot = true;
    const format = bundleKind(entry.name);
    const relative = parent && path.slice(parent.label.length + 1);
    if (parent) bundleEntry(parent, relative, directory ? 'directory' : 'file', null,
      directory ? undefined : () => adapter.getFile(entry));
    if (!directory) {
      stats.files_seen += 1;
      const openFile = () => adapter.getFile(entry);
      if (format && format !== 'app') {
        if (direct) recordRoot(stats, root.name, 'skipped');
        const queued = flow.job(opaquePlugin(path, format));
        if (queued) await queued;
      } else if (direct || ARCHIVE.test(entry.name)) {
        let size;
        try {
          size = (await openFile()).size;
        } catch (error) {
          skippedError(stats, error, path);
          return;
        }
        if (parent) {
          parent.size = (parent.size ?? 0) + size;
          recordNested(parent, path, stats);
        }
        const wait = flow.job({ kind: 'file', openFile, size, label: path, parentBundlePath: parent?.label });
        if (wait) await wait;
      } else if (parent || worthProbing(entry.name)) {
        const probe = !bundlePlist(relative) && worthProbing(entry.name);
        const getSize = adapter.getSize && (() => adapter.getSize(entry));
        const wait = probes.add(openFile, path, parent, { lazy: true, probe, getSize });
        if (wait) await wait;
      }
      return;
    }

    stats.directories_seen += 1;
    if (format && format !== 'app') {
      recordNested(parent, path, stats);
      const open = (relative) => adapter.open(entry, relative.split('/'));
      const queued = flow.job(pluginJob(path, format, open, stats, parent?.label));
      if (queued) await queued;
      return;
    }
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
    if (format === 'app') {
      bundle = bundleAt(path, parent?.label ?? null, (parts) => adapter.open(entry, parts));
      recordNested(parent, path, stats);
    }
    const frame = { entry, path, bundle, parent: bundle ?? parent, unvisited: 0 };
    frame.cursor = adapter.children(entry, frame);
    stack.push(frame);
  }

  let readRoot = false;
  try {
    await visit(root, root.name, null, true);
    while (stack.length) {
      flow.check();
      const top = stack.at(-1);
      let step;
      try {
        step = await top.cursor.next();
      } catch (error) {
        skippedError(stats, error, top.path);
      }
      if (top.entry === root && step) readRoot = true;
      if (step && !step.done) {
        const child = step.value;
        await visit(child, `${top.path}/${child.name}`, top.parent, false);
      } else {
        stack.pop();
        if (top.bundle) {
          const wait = probes.drain();
          if (wait) await wait;
          const queued = flow.job(bundleJob(top.bundle, stats));
          if (queued) await queued;
        }
      }
      const wait = flow.pause();
      if (wait) await wait;
    }
    await probes.drain();
    if (rootRecord) {
      const format = bundleKind(root.name);
      rootRecord.status = readRoot || (format && format !== 'app')
        ? skipCount() > priorSkips ? 'partial' : 'scanned'
        : 'skipped';
    }
  } catch (error) {
    if (rootRecord && enteredRoot) rootRecord.status = 'partial';
    if (error instanceof FolderCrashGuardError) {
      // Count entries already returned in directory batches. Reading more to
      // get a total would repeat the work that the guard is trying to avoid.
      for (const frame of stack) {
        stats.skipped_entries.browser_crash_guard += frame.unvisited;
        if (frame.bundle) error.unfinishedApps += 1;
      }
      await probes.drain();
    }
    throw error;
  } finally {
    for (const { cursor } of stack.reverse()) await cursor.return?.();
  }
}

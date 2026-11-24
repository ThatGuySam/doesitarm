const isApp = (name) => /\.app$/i.test(name);

function fromFile(file, label = file.name) {
  return { kind: 'file', label, file };
}

function bundleJob(label, open, files) {
  return {
    kind: 'bundle',
    label,
    getPlist: () => open(['Contents', 'Info.plist']),
    getExecutable: (relative) => open(relative.split('/')),
    getBundleFiles: files,
  };
}

export function* pickedFolders(files) {
  const bundles = new Map();
  for (const file of files) {
    const path = file.webkitRelativePath || file.name;
    const parts = path.split('/');
    const position = parts.slice(0, -1).findIndex(isApp);
    if (position < 0) {
      yield fromFile(file, path);
      continue;
    }
    const bundle = parts.slice(0, position + 1).join('/');
    if (!bundles.has(bundle)) bundles.set(bundle, new Map());
    const relative = parts.slice(position + 1);
    if (relative[0] === 'Contents') bundles.get(bundle).set(relative.join('/'), file);
  }

  for (const [label, entries] of bundles) {
    yield bundleJob(label, (parts) => {
      const path = parts.join('/');
      const file = entries.get(path);
      if (!file) throw new Error(`The selected app has no readable ${path}.`);
      return file;
    }, () => entries);
  }
}

const entryFile = (entry) => new Promise((resolve, reject) => entry.file(resolve, reject));
const entryChild = (entry, name, method) => new Promise((resolve, reject) => {
  entry[method](name, {}, resolve, reject);
});

async function readEntryPath(directory, parts) {
  let entry = directory;
  for (const part of parts.slice(0, -1)) entry = await entryChild(entry, part, 'getDirectory');
  return entryFile(await entryChild(entry, parts.at(-1), 'getFile'));
}

async function* entryFiles(directory, prefix = '') {
  const reader = directory.createReader();
  while (true) {
    const children = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (!children.length) break;
    for (const child of children) {
      if (!prefix && child.name !== 'Contents') continue;
      const path = prefix + child.name;
      if (child.isFile) yield [path, await entryFile(child)];
      else if (child.isDirectory) yield* entryFiles(child, `${path}/`);
    }
  }
}

async function* walkEntry(entry, path = entry.name) {
  if (entry.isFile) {
    yield fromFile(await entryFile(entry), path);
  } else if (entry.isDirectory && isApp(entry.name)) {
    yield bundleJob(path, (parts) => readEntryPath(entry, parts), () => entryFiles(entry));
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    while (true) {
      const children = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
      if (!children.length) break;
      for (const child of children) yield* walkEntry(child, `${path}/${child.name}`);
    }
  }
}

async function readHandlePath(directory, parts) {
  let handle = directory;
  for (const part of parts.slice(0, -1)) handle = await handle.getDirectoryHandle(part);
  return (await handle.getFileHandle(parts.at(-1))).getFile();
}

async function* handleFiles(directory, prefix = '') {
  for await (const handle of directory.values()) {
    if (!prefix && handle.name !== 'Contents') continue;
    const path = prefix + handle.name;
    if (handle.kind === 'file') yield [path, await handle.getFile()];
    else yield* handleFiles(handle, `${path}/`);
  }
}

async function* walkHandle(handle, path = handle.name) {
  if (handle.kind === 'file') {
    yield fromFile(await handle.getFile(), path);
  } else if (isApp(handle.name)) {
    yield bundleJob(path, (parts) => readHandlePath(handle, parts), () => handleFiles(handle));
  } else {
    for await (const child of handle.values()) yield* walkHandle(child, `${path}/${child.name}`);
  }
}

export async function* droppedJobs(transfer) {
  // Capture entries and handles before the drop event's protected data store closes.
  const files = Array.from(transfer.files);
  const items = Array.from(transfer.items ?? []).filter((item) => item.kind === 'file');
  const sources = items.map((item) => {
    const entry = item.getAsEntry?.() ?? item.webkitGetAsEntry?.();
    const file = item.getAsFile();
    const handle = entry ? null : item.getAsFileSystemHandle?.().catch(() => null);
    return { entry, file, handle };
  });

  if (!sources.length) {
    for (const file of files) yield fromFile(file);
    return;
  }
  for (const { entry, file, handle } of sources) {
    try {
      if (entry) {
        yield* walkEntry(entry);
        continue;
      }
      const resolved = await handle;
      if (resolved) yield* walkHandle(resolved);
      else if (file) yield fromFile(file);
    } catch {
      yield {
        kind: 'error',
        label: entry?.name ?? file?.name ?? 'Dropped item',
        error: 'The browser could not read this item. Try choosing it with a file or folder picker.',
      };
    }
  }
}

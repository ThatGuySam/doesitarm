import { fileJob, folderStats, skipped, walkDirectory, walkFileList, yieldToPage } from './folder-walk.js';

const number = new Intl.NumberFormat();

function captureDrop(transfer) {
  const sources = [];
  for (const item of transfer.items ?? []) {
    if (item.kind !== 'file') continue;
    const entry = item.getAsEntry?.() ?? item.webkitGetAsEntry?.();
    const file = entry?.isDirectory ? null : item.getAsFile();
    let handle;
    try {
      handle = item.getAsFileSystemHandle?.().catch(() => null);
    } catch {
      // Some contexts expose the method without granting access to the handle.
    }
    sources.push({ handle, entry, file });
  }
  return sources.length ? { sources } : { files: transfer.files };
}

async function preferHandle(handle, fallback, signal) {
  if (!handle) return null;
  let timer;
  let abort;
  try {
    return await Promise.race([
      handle,
      new Promise((resolve) => {
        abort = () => resolve(null);
        signal.addEventListener('abort', abort, { once: true });
        // Some Chromium drop transports leave handle acquisition pending.
        timer = setTimeout(() => resolve(null), fallback ? 750 : 2_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

export function bindLocalInputs({ view, pool, mode }) {
  const get = (id) => document.getElementById(id);
  const files = get('files');
  const folder = get('folder');
  const chooser = get('choose-folder');
  const dropZone = get('drop-zone');
  const loader = get('folder-loader');
  const [throbber, label, announcement] = loader.children;
  const notice = get('input-status');
  const fallbackChooser = document.createElement('button');
  fallbackChooser.type = 'button';
  fallbackChooser.className = 'secondary';
  fallbackChooser.textContent = 'Use alternate folder picker';
  fallbackChooser.hidden = true;
  loader.append(fallbackChooser);
  const active = new Set();
  let picker = null;

  function reading(text) {
    if (label.textContent !== text) label.textContent = text;
    throbber.hidden = !text;
    const phase = text.startsWith('Preparing') ? 'Preparing selected files…' : text ? 'Reading folder…' : '';
    if (announcement.textContent !== phase) announcement.textContent = phase;
  }

  function restoredFocus() {
    if (picker && document.visibilityState === 'visible') reading('Reading folder…');
  }
  window.addEventListener('focus', restoredFocus);
  document.addEventListener('visibilitychange', restoredFocus);

  function finishPicker() {
    picker = null;
    if (!active.size) reading('');
  }

  function openFallback() {
    picker = {};
    fallbackChooser.hidden = true;
    folder.click();
  }

  async function discover(method, total, walk, folderName = null) {
    const controller = new AbortController();
    const discovered = new Set();
    const stats = folderStats(method);
    stats.folder_name = folderName;
    const run = view.beginFolder(stats, mode());
    const jobs = [];
    const flush = () => {
      if (jobs.length) view.add(jobs.splice(0), run);
    };
    active.add(controller);
    notice.textContent = '';
    reading(total ? `Preparing ${number.format(total)} files…` : 'Reading folder…');
    try {
      // Let the loader paint before touching a native FileList.
      await yieldToPage();
      controller.signal.throwIfAborted();
      await walk({
        stats,
        signal: controller.signal,
        onProgress() {
          const seen = number.format(stats.files_seen);
          reading(total ? `Preparing ${number.format(total)} files… ${seen} checked` :
            `Reading folder… ${seen} files found`);
          flush();
        },
        onJob(job) {
          if (discovered.has(job.label)) {
            skipped(stats, 'duplicate_path', job.label);
            return;
          }
          discovered.add(job.label);
          if (job.kind === 'bundle') run.appCount += 1;
          jobs.push(job);
          if (jobs.length >= 32) flush();
        },
      });
      flush();
      if (!discovered.size) notice.textContent = 'No apps, Mach-O files, or supported archives were found.';
    } catch (error) {
      if (!controller.signal.aborted) {
        flush();
        notice.textContent = 'The browser could not finish reading this selection.';
        skipped(stats, `enumeration_error:${error?.name ?? 'Error'}`, stats.folder_name);
      }
    } finally {
      active.delete(controller);
      view.finishFolder(run, controller.signal.aborted);
      if (!active.size && !picker) reading('');
    }
  }

  get('cancel-all').addEventListener('click', () => {
    for (const controller of active) controller.abort();
    pool.cancelAll();
    notice.textContent = '';
    reading('');
  });
  get('choose-files').addEventListener('click', () => files.click());
  fallbackChooser.addEventListener('click', openFallback);
  chooser.addEventListener('click', () => {
    if (picker) return;
    notice.textContent = '';
    if (typeof window.showDirectoryPicker !== 'function') {
      openFallback();
      return;
    }
    picker = {};
    fallbackChooser.hidden = true;
    void (async () => {
      let handle;
      try {
        handle = await window.showDirectoryPicker({ mode: 'read' });
      } catch (error) {
        // The API uses AbortError for both dismissal and a protected directory.
        fallbackChooser.hidden = false;
        if (error.name !== 'AbortError') {
          notice.textContent = 'The browser could not open the folder directly.';
        }
      } finally {
        finishPicker();
      }
      if (handle) await discover('showDirectoryPicker', 0,
        (options) => walkDirectory(handle, 'handle', options), handle.name);
    })();
  });

  files.addEventListener('change', () => {
    view.add(Array.from(files.files, (file) => fileJob(file)));
    files.value = '';
  });
  folder.addEventListener('cancel', finishPicker);
  folder.addEventListener('change', () => {
    const selection = folder.files;
    finishPicker();
    folder.value = '';
    if (selection.length) void discover('webkitdirectory', selection.length,
      (options) => walkFileList(selection, options));
  });

  const hasFiles = (event) => Array.from(event.dataTransfer?.types ?? []).includes('Files');
  let dragDepth = 0;
  dropZone.addEventListener('dragenter', (event) => {
    if (!hasFiles(event)) return;
    dragDepth += 1;
    dropZone.classList.add('dragging');
  });
  dropZone.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropZone.classList.remove('dragging');
  });
  window.addEventListener('dragover', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = dropZone.contains(event.target) ? 'copy' : 'none';
  });
  window.addEventListener('drop', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth = 0;
    dropZone.classList.remove('dragging');
    if (!dropZone.contains(event.target)) return;
    const { sources, files: dropped } = captureDrop(event.dataTransfer);
    // The drop's data store closes on return. Only native entry promises and
    // explicit files captured above are used after that point.
    if (!sources) {
      view.add(Array.from(dropped, (file) => fileJob(file)));
      return;
    }
    void discover('drop', 0, async (options) => {
      const methods = new Set();
      for (const { handle, entry, file } of sources) {
        options.signal.throwIfAborted();
        const resolved = await preferHandle(handle, entry ?? file, options.signal);
        options.signal.throwIfAborted();
        if (resolved) {
          methods.add('getAsFileSystemHandle');
          await walkDirectory(resolved, 'handle', options);
        } else if (entry) {
          methods.add('webkitGetAsEntry');
          await walkDirectory(entry, 'entry', options);
        } else if (file) {
          methods.add('DataTransfer.files');
          options.stats.files_seen += 1;
          options.onJob(fileJob(file));
        }
        options.stats.method = [...methods].join(', ') || 'drop';
      }
    });
  });
}

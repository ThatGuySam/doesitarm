import { crash, memoryPressure } from './crash-journal.js';
import { fileJob, FolderLimitError, folderStats, skipped, walkDirectory, walkFileList, yieldToPage } from './folder-walk.js';

const number = new Intl.NumberFormat();
const MAX_FLAT_FILES = 512;
const MAX_FOLDER_ROWS = 8192;
const MEMORY_LIMIT = 0.92;
const FEWER_FOLDERS = 'Your results so far are kept. Drag fewer folders, or one subfolder at a time.';
class MemoryPressureError extends Error {
  name = 'MemoryPressureError';
}

// Errors the folder read can recover from by stopping and keeping what it has.
export function recoverableFolderError(error) {
  if (error instanceof FolderLimitError) return 'folder_result_limit';
  if (error instanceof MemoryPressureError) return 'memory_pressure';
  if (error instanceof RangeError) return 'out_of_memory';
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) return `dom_exception:${error.name}`;
  return `enumeration_error:${error?.name ?? 'Error'}`;
}

const FOLDER_GUIDANCE = 'Drag your folder here. If the browser cannot read it, drag smaller subfolders or individual .app bundles. You can also select an app archive.';

function captureDrop(transfer) {
  if (transfer.items?.length > MAX_FLAT_FILES) return {};
  const sources = [];
  for (const item of transfer.items ?? []) {
    if (item.kind !== 'file') continue;
    let handle;
    try {
      handle = item.getAsFileSystemHandle?.().catch(() => null);
    } catch {
      // Some contexts expose the method without granting access to the handle.
    }
    const entry = item.getAsEntry?.() ?? item.webkitGetAsEntry?.();
    const file = entry?.isDirectory ? null : item.getAsFile();
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

export function bindLocalInputs({ view, mode }) {
  const get = (id) => document.getElementById(id);
  const files = get('files');
  const chooser = get('choose-folder');
  const dropZone = get('drop-zone');
  const loader = get('folder-loader');
  const [throbber, label, announcement] = loader.children;
  const notice = get('input-status');
  let active;
  let picker = false;

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

  async function discover(method, total, walk, folderName = null) {
    if (active) {
      notice.textContent = 'Wait for the current folder to finish or cancel it before adding another.';
      return;
    }
    const controller = new AbortController();
    const { signal } = controller;
    const discovered = new Set();
    const stats = folderStats(method);
    stats.folder_name = folderName;
    const run = view.beginFolder(stats, mode(), { resultLimit: MAX_FOLDER_ROWS, recoverable: true });
    const jobs = [];
    async function flush() {
      if (!jobs.length) return;
      await view.waitForCapacity(jobs.length, signal, true);
      signal.throwIfAborted();
      view.add(jobs.splice(0), run);
    }
    active = controller;
    notice.textContent = '';
    reading(total ? `Preparing ${number.format(total)} files…` : 'Reading folder…');
    try {
      // Paint the loader before starting filesystem work.
      await yieldToPage();
      await run.ready;
      signal.throwIfAborted();
      await walk({
        stats,
        signal: controller.signal,
        onProgress() {
          if (memoryPressure() > MEMORY_LIMIT) throw new MemoryPressureError('The page is close to its memory limit.');
          const seen = number.format(stats.files_seen);
          reading(total ? `Preparing ${number.format(total)} files… ${seen} checked` :
            `Reading folder… ${seen} files found`);
          return flush();
        },
        onJob(job) {
          if (discovered.has(job.label)) {
            skipped(stats, 'duplicate_path', job.label);
            return;
          }
          if (discovered.size >= MAX_FOLDER_ROWS) throw new FolderLimitError();
          discovered.add(job.label);
          if (job.kind === 'bundle') run.appCount += 1;
          jobs.push(job);
          if (jobs.length >= 16) return flush();
        },
      });
      await flush();
      if (stats.partial) notice.textContent = 'Some bundle members exceeded the scan limit. Scan the affected apps in smaller selections for more detail.';
      else if (!discovered.size) notice.textContent = 'No apps, Mach-O files, or supported archives were found.';
    } catch (error) {
      if (!controller.signal.aborted) {
        stats.partial = true;
        const reason = recoverableFolderError(error);
        if (error instanceof FolderLimitError) {
          notice.textContent = 'This selection reached the scan limit. Scan smaller subfolders to check the remaining apps.';
        } else if (reason === 'memory_pressure' || reason === 'out_of_memory') {
          notice.textContent = `The browser is running low on memory, so reading stopped early. ${FEWER_FOLDERS}`;
        } else {
          notice.textContent = `The browser could not finish reading this selection. ${FEWER_FOLDERS}`;
        }
        skipped(stats, reason, stats.folder_name);
        crash.error('folder_read_error', error, { reason, recovered: true });
        await flush().catch(() => {});
      }
    } finally {
      active = undefined;
      view.finishFolder(run, controller.signal.aborted);
      if (!active && !picker) reading('');
    }
  }

  get('cancel-all').addEventListener('click', () => {
    active?.abort();
    view.cancelAll();
    notice.textContent = '';
    reading('');
  });
  get('choose-files').addEventListener('click', () => files.click());
  chooser.addEventListener('click', async () => {
    if (picker) return;
    notice.textContent = '';
    if (typeof window.showDirectoryPicker !== 'function') {
      notice.textContent = FOLDER_GUIDANCE;
      return;
    }
    picker = true;
    reading('Opening folder…');
    let handle;
    try {
      handle = await window.showDirectoryPicker({ mode: 'read' });
    } catch {
      // Chromium also reports protected directory selections as AbortError.
      notice.textContent = FOLDER_GUIDANCE;
    } finally {
      picker = false;
      if (!active) reading('');
    }
    if (handle) await discover('showDirectoryPicker', 0,
      (options) => walkDirectory(handle, 'handle', options), handle.name);
  });

  files.addEventListener('change', () => {
    if (files.files.length > MAX_FLAT_FILES) {
      notice.textContent = 'Select up to 512 files at a time, or drag their folder here.';
    } else {
      view.add(Array.from(files.files, (file) => fileJob(file)));
    }
    files.value = '';
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
  window.addEventListener('dragenter', (event) => {
    if (hasFiles(event)) document.querySelector('.dia-scanner').classList.add('drag-active');
  });
  window.addEventListener('dragleave', (event) => {
    if (!event.relatedTarget) document.querySelector('.dia-scanner').classList.remove('drag-active');
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
    document.querySelector('.dia-scanner').classList.remove('drag-active');
    dropZone.classList.remove('dragging');
    if (!dropZone.contains(event.target)) return;
    const { sources, files: dropped } = captureDrop(event.dataTransfer);
    // The drop's data store closes on return. Only native entry promises and
    // explicit files captured above are used after that point.
    if (!sources) {
      if (dropped?.length > MAX_FLAT_FILES || !dropped) {
        notice.textContent = 'Drop up to 512 items at a time, or drop their parent folder.';
      } else if (dropped.length) {
        const selection = Array.from(dropped);
        void discover('DataTransfer.files', selection.length, (options) => walkFileList(selection, options));
      } else {
        notice.textContent = FOLDER_GUIDANCE;
      }
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
          await options.onJob(fileJob(file));
        }
        options.stats.method = [...methods].join(', ') || 'drop';
      }
    });
  });
}

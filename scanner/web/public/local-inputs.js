import { crash, memoryPressure } from './crash-journal.js';
import {
  fileJob, FolderCrashGuardError, folderCrashGuard, FolderLimitError, folderStats, recordRoot, skipped,
  walkDirectory, walkFileList, yieldToPage,
} from './folder-walk.js';
import { notify } from './notifications.js';

const number = new Intl.NumberFormat();
const FALLBACK_FLAT_FILE_LIMIT = 512;
const FALLBACK_FOLDER_ROW_LIMIT = 8192;
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

const FOLDER_GUIDANCE = 'Drag your folder here. If the browser cannot read it, drag smaller subfolders or individual app or plug-in bundles. You can also select an app archive.';

function captureDrop(transfer) {
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
  const flatPicker = get('choose-flat-files');
  const dropZone = get('drop-zone');
  const loader = get('folder-loader');
  const [throbber, label, announcement] = loader.children;
  let active;
  let picker = false;
  const canPickDirectory = typeof window.showDirectoryPicker === 'function';
  const flatFileLimit = canPickDirectory ? Infinity : FALLBACK_FLAT_FILE_LIMIT;
  const folderRowLimit = canPickDirectory ? Infinity : FALLBACK_FOLDER_ROW_LIMIT;
  flatPicker.hidden = canPickDirectory;
  get('plugin-picker-hint').hidden = !canPickDirectory;

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
      notify.info('A folder scan is in progress.', 'Wait for it to finish or cancel it before adding another.');
      return;
    }
    const controller = new AbortController();
    const { signal } = controller;
    const discovered = new Set();
    const stats = folderStats(method);
    stats.folder_name = folderName;
    const run = view.beginFolder(stats, mode(), { resultLimit: folderRowLimit, recoverable: true });
    const jobs = [];
    async function flush() {
      if (!jobs.length) return;
      await view.waitForCapacity(jobs.length, signal, true);
      signal.throwIfAborted();
      view.add(jobs.splice(0), run);
    }
    active = controller;
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
          // Two dropped roots can both be named Components and contain different copies.
          if (job.kind !== 'plugin' && discovered.has(job.label)) {
            skipped(stats, 'duplicate_path', job.label);
            return;
          }
          if (discovered.size + run.pluginCount >= folderRowLimit) throw new FolderLimitError();
          if (job.kind !== 'plugin') discovered.add(job.label);
          if (job.kind === 'bundle') run.appCount += 1;
          if (job.kind === 'plugin') run.pluginCount += 1;
          jobs.push(job);
          if (jobs.length >= 16) return flush();
        },
      });
      await flush();
      const { unreadable, permission_denied, bundle_artifact_limit, nested_path_limit } = stats.skipped_entries;
      if (unreadable || permission_denied) {
        stats.partial = true;
        notify.error('The browser could not read some entries.', FEWER_FOLDERS);
      }
      if (bundle_artifact_limit || nested_path_limit) {
        notify.error('Some bundle members exceeded the scan limit.', 'Scan the affected bundles in smaller selections for more detail.');
      } else if (!stats.partial && !discovered.size && !run.pluginCount) {
        notify.info('No apps, audio plug-ins, Mach-O files, or supported archives were found.');
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        stats.partial = true;
        if (error instanceof FolderCrashGuardError) {
          const count = stats.skipped_entries.browser_crash_guard;
          const skippedLabel = `${number.format(count)} ${count === 1 ? 'entry' : 'entries'}`;
          const apps = error.unfinishedApps;
          const unfinished = apps ? ` Left out ${number.format(apps)} unfinished app ${apps === 1 ? 'bundle' : 'bundles'}.` : '';
          notify.error('The folder scan stopped at the browser crash guard.',
            `The guard allows ${number.format(error.limit)} ${error.units} per drop. Skipped at least ${skippedLabel}.${unfinished} Drag smaller subfolders or individual apps to continue.`);
        } else {
          const reason = recoverableFolderError(error);
          if (error instanceof FolderLimitError) {
            notify.error('This selection reached the scan limit.', 'Scan smaller subfolders to check the remaining apps.');
          } else if (reason === 'memory_pressure' || reason === 'out_of_memory') {
            notify.error('The browser is running low on memory, so reading stopped early.', FEWER_FOLDERS);
          } else {
            notify.error('The browser could not finish reading this selection.', FEWER_FOLDERS);
          }
          skipped(stats, reason, stats.folder_name);
          crash.error('folder_read_error', error, { reason, recovered: true });
        }
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
    notify.info('Scan canceled.', 'Your finished results are kept.');
    reading('');
  });
  get('choose-files').addEventListener('click', () => {
    if (canPickDirectory) files.click();
    else notify.info('Drag and drop apps to scan them.', FOLDER_GUIDANCE);
  });
  flatPicker.addEventListener('click', () => files.click());
  chooser.addEventListener('click', async () => {
    if (picker) return;
    if (typeof window.showDirectoryPicker !== 'function') {
      notify.info('Folder picker unavailable.', FOLDER_GUIDANCE);
      return;
    }
    picker = true;
    reading('Opening folder…');
    let handle;
    try {
      handle = await window.showDirectoryPicker({ mode: 'read' });
    } catch {
      // Chromium also reports protected directory selections as AbortError.
      notify.error('Could not open the folder picker.', FOLDER_GUIDANCE);
    } finally {
      picker = false;
      if (!active) reading('');
    }
    if (handle) await discover('showDirectoryPicker', 0,
      (options) => walkDirectory(handle, 'handle', options), handle.name);
  });

  files.addEventListener('change', () => {
    const count = Math.min(files.files.length, flatFileLimit);
    const remaining = files.files.length - count;
    if (remaining) {
      notify.error('The file selection reached the browser crash guard.',
        `Skipped ${number.format(remaining)} ${remaining === 1 ? 'file' : 'files'}. Select up to ${flatFileLimit} files at a time, or drag smaller subfolders here.`);
    }
    view.add(Array.from({ length: count }, (_, index) => fileJob(files.files[index])));
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
    const transfer = event.dataTransfer;
    if (transfer.items?.length > flatFileLimit) {
      notify.error('Too many items dropped.', `Drop up to ${flatFileLimit} items at a time, or drop their parent folder.`);
      return;
    }
    const { sources, files: dropped } = captureDrop(transfer);
    // The drop's data store closes on return. Only native entry promises and
    // explicit files captured above are used after that point.
    if (!sources) {
      if (dropped?.length > flatFileLimit) {
        notify.error('Too many files dropped.', `Drop up to ${flatFileLimit} files at a time, or drag smaller subfolders here.`);
      } else if (dropped?.length) {
        const selection = Array.from(dropped);
        void discover('DataTransfer.files', selection.length, (options) => walkFileList(selection, options));
      } else {
        notify.info('No readable files were dropped.', FOLDER_GUIDANCE);
      }
      return;
    }
    void discover('drop', 0, async (options) => {
      if (!canPickDirectory) options.crashGuard = folderCrashGuard(options.stats);
      const methods = new Set();
      let index = 0;
      try {
        for (; index < sources.length; index += 1) {
          const { handle, entry, file } = sources[index];
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
            options.crashGuard?.(file.name, false);
            options.stats.files_seen += 1;
            const job = fileJob(file);
            if (job.opaque) recordRoot(options.stats, job.label, 'skipped');
            await options.onJob(job);
          } else {
            recordRoot(options.stats, null, 'skipped');
          }
        }
      } catch (error) {
        for (const { entry, file } of sources.slice(index + 1)) {
          if (error instanceof FolderCrashGuardError) {
            skipped(options.stats, 'browser_crash_guard', entry?.name ?? file?.name);
          }
          if (entry?.isDirectory || (!entry && !file)) recordRoot(options.stats, entry?.name ?? null, 'skipped');
        }
        throw error;
      } finally {
        options.stats.method = [...methods].join(', ') || 'drop';
      }
    });
  });
}

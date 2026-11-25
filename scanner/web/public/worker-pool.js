import { timeSlice } from './folder-walk.js';
import { ScanQueue } from './scan-queue.js';
import { emptyResult } from './scan-result.js';

const permissionError = (error) => error?.name === 'NotAllowedError' || error?.name === 'SecurityError';

export class ScanPool {
  #mode;
  #makeWorker;
  #slots = new Set();
  #queue = new ScanQueue();
  #dispatchPending = false;

  constructor(mode, makeWorker = () =>
    new Worker(new URL('./scan-worker.js', import.meta.url), { type: 'module' })) {
    this.#mode = mode;
    this.#makeWorker = makeWorker;
  }

  submit(id, job, update) {
    this.#queue.push({ id, job, update, size: job.file?.size ?? job.size ?? Infinity });
    this.#schedule();
  }

  setMode(mode) {
    if (mode.limit === this.#mode.limit && mode.passive === this.#mode.passive) return;
    this.#mode = mode;
    for (const slot of this.#slots) {
      if (slot.task) slot.worker.postMessage({ type: 'mode', passive: mode.passive });
    }
    this.#schedule();
  }

  cancel(id) {
    for (const slot of this.#slots) {
      if (slot.task?.id !== id) continue;
      const task = slot.task;
      this.#retire(slot);
      task.update({ type: 'canceled' });
      this.#schedule();
      return;
    }
    this.#queue.remove(id)?.update({ type: 'canceled' });
  }

  cancelAll() {
    const queued = this.#queue.clear();
    for (const slot of this.#slots) {
      const task = slot.task;
      this.#retire(slot);
      if (task) queued.push(task);
    }
    const pause = timeSlice();
    void (async () => {
      for (const task of queued) {
        task.update({ type: 'canceled' });
        const wait = pause();
        if (wait) await wait;
      }
    })();
  }

  #schedule() {
    if (this.#dispatchPending) return;
    this.#dispatchPending = true;
    // Pick the smallest jobs from the whole selection before launching any.
    queueMicrotask(() => {
      this.#dispatchPending = false;
      this.#dispatch();
    });
  }

  #dispatch() {
    const { limit } = this.#mode;
    const idle = [...this.#slots].filter((slot) => !slot.task);
    while (idle.length && this.#slots.size > limit) this.#retire(idle.pop());
    let active = this.#slots.size - idle.length;
    if (active >= limit || !this.#queue.length) return;

    while (active < limit && this.#queue.length) {
      const task = this.#queue.shift();
      let slot;
      try {
        slot = idle.shift() ?? this.#createSlot();
      } catch {
        this.#finishError(task, 'The browser could not start a module worker.');
        continue;
      }
      clearTimeout(slot.idleTimer);
      slot.task = task;
      active += 1;
      void this.#run(slot, task);
    }
  }

  #createSlot() {
    const worker = this.#makeWorker();
    const slot = { worker, task: null, idleTimer: undefined };
    this.#slots.add(slot);

    worker.addEventListener('message', ({ data }) => {
      const task = slot.task;
      if (!task || data.id !== task.id) return;
      if (data.type === 'executable-needed') {
        void this.#sendExecutable(slot, task, data.path ?? data.name);
      } else if (['progress', 'remote', 'done'].includes(data.type)) {
        if (data.type === 'done') {
          data.directoryListings = task.listings ?? task.job.directoryListings;
          this.#idle(slot);
        }
        task.update(data);
      }
    });
    worker.addEventListener('error', () => {
      const task = slot.task;
      this.#retire(slot);
      if (task) this.#finishError(task, 'The browser scan worker stopped unexpectedly.');
      this.#schedule();
    });
    return slot;
  }

  async #run(slot, task) {
    const { id, job, update } = task;
    update({ type: 'start' });
    try {
      const { kind, label, url, forceWorker, probe, parentBundlePath, plistPath, roleHint } = job;
      const file = job.file ?? await job.openFile?.();
      const [plist, listings] = kind === 'bundle'
        ? await Promise.all([job.getPlist(), job.getDirectoryListings?.()])
        : [];
      if (slot.task !== task) return;
      task.listings = listings;
      slot.worker.postMessage({
        id,
        job: { kind, label, file, url, forceWorker, plist, probe, parentBundlePath, plistPath, roleHint },
        passive: this.#mode.passive,
      });
    } catch (cause) {
      if (slot.task !== task) return;
      job.recordError?.(cause);
      const error = job.kind === 'bundle'
        ? 'The browser could not open Info.plist in this app folder.'
        : 'The browser could not open this input.';
      this.#idle(slot);
      const errorClass = permissionError(cause) ? 'permission_denied' :
        job.kind === 'bundle' ? 'unreadable_info_plist' : 'unreadable_input';
      this.#finishError(task, error, errorClass);
    }
  }

  async #sendExecutable(slot, task, path) {
    let file;
    let errorClass;
    let resolution;
    try {
      try {
        file = await task.job.getExecutable(path);
      } catch (cause) {
        if (cause?.name !== 'NotFoundError') throw cause;
      }
      if (!file && path.startsWith('Contents/MacOS/MacOS/')) {
        const alias = path.replace('Contents/MacOS/MacOS/', 'Contents/MacOS/');
        file = await task.job.getExecutable(alias);
        if (file) {
          path = alias;
          resolution = 'contents_relative';
        }
      }
    } catch (cause) {
      if (cause?.name !== 'NotFoundError') {
        task.job.recordError?.(cause);
        errorClass = permissionError(cause) ? 'permission_denied' : 'unreadable_executable';
      }
    }
    if (slot.task === task) slot.worker.postMessage({ type: 'executable', id: task.id, file, path, resolution, errorClass });
  }

  #finishError(task, error, errorClass = 'worker_stopped') {
    const { job, listings } = task;
    const result = { ...emptyResult('source_error', error, job.file?.size ?? job.size), error_class: errorClass };
    if (job.kind === 'bundle') {
      result.format = 'app';
      result.bundle_path = job.label;
    }
    task.update({
      type: 'done',
      result,
      source: 'Browser',
      evidence: job.kind === 'bundle' ? { info_plist_path: job.plistPath ?? null, read_log: [] } : undefined,
      directoryListings: listings,
    });
  }

  #retire(slot) {
    clearTimeout(slot.idleTimer);
    slot.task = null;
    this.#slots.delete(slot);
    slot.worker.terminate();
  }

  #idle(slot) {
    slot.task = null;
    slot.idleTimer = setTimeout(() => this.#retire(slot), 10_000);
    this.#schedule();
  }
}

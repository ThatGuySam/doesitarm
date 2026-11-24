import { emptyResult } from './scan-result.js';

export class ScanPool {
  #mode;
  #makeWorker;
  #slots = new Set();
  #queue = [];
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
    const index = this.#queue.findIndex((task) => task.id === id);
    if (index !== -1) {
      const [task] = this.#queue.splice(index, 1);
      task.update({ type: 'canceled' });
    }
  }

  cancelAll() {
    const tasks = this.#queue.splice(0);
    for (const slot of this.#slots) {
      if (slot.task) tasks.push(slot.task);
      this.#retire(slot);
    }
    for (const task of tasks) task.update({ type: 'canceled' });
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

    // Array sorting is stable, so equal-size and unknown-size jobs keep arrival order.
    this.#queue.sort((a, b) => a.size === b.size ? 0 : a.size - b.size);
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
        void this.#sendExecutable(slot, task, data.name);
      } else if (['progress', 'remote', 'done'].includes(data.type)) {
        if (data.type === 'done') this.#idle(slot);
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
      const { kind, label, file, url, forceWorker } = job;
      const plist = kind === 'bundle' ? await job.getPlist() : undefined;
      if (slot.task !== task) return;
      slot.worker.postMessage({
        id, job: { kind, label, file, url, forceWorker, plist }, passive: this.#mode.passive,
      });
    } catch {
      if (slot.task !== task) return;
      const error = job.kind === 'bundle'
        ? 'The browser could not open Contents/Info.plist in this app folder.'
        : 'The browser could not open this input.';
      this.#idle(slot);
      this.#finishError(task, error);
    }
  }

  async #sendExecutable(slot, task, name) {
    let file;
    try {
      file = await task.job.getExecutable(name);
    } catch {
      // The worker returns the parsed metadata alongside its missing-file result.
    }
    if (slot.task === task) slot.worker.postMessage({ type: 'executable', id: task.id, file });
  }

  #finishError(task, error) {
    task.update({
      type: 'done',
      result: emptyResult('source_error', error, task.job.file?.size),
      source: 'Browser',
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

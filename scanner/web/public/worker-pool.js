import { emptyResult } from './scan-result.js';

export class ScanPool {
  #size;
  #slots = new Set();
  #queue = [];

  constructor(size) {
    this.#size = size;
  }

  submit(id, job, budget, update) {
    this.#queue.push({ id, job, budget, update });
    this.#schedule();
  }

  #schedule() {
    while (this.#queue.length) {
      let slot = [...this.#slots].find((item) => !item.task);
      if (!slot) {
        if (this.#slots.size >= this.#size) return;
        try {
          slot = this.#createSlot();
        } catch {
          this.#finishError(this.#queue.shift(), 'The browser could not start a module worker.');
          continue;
        }
      }
      clearTimeout(slot.idleTimer);
      slot.task = this.#queue.shift();
      void this.#run(slot, slot.task);
    }
  }

  #createSlot() {
    const worker = new Worker(new URL('./scan-worker.js', import.meta.url), { type: 'module' });
    const slot = { worker, task: null, idleTimer: undefined };
    this.#slots.add(slot);

    worker.addEventListener('message', ({ data }) => {
      const task = slot.task;
      if (!task || data.id !== task.id) return;
      if (data.type === 'executable-needed') {
        void this.#sendExecutable(slot, task, data.name);
      } else {
        task.update(data);
        if (data.type === 'done') this.#idle(slot);
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
    const { id, job, budget, update } = task;
    update({ type: 'start' });
    try {
      const { kind, label, file, url, forceWorker } = job;
      const plist = kind === 'bundle' ? await job.getPlist() : undefined;
      slot.worker.postMessage({ id, job: { kind, label, file, url, forceWorker, plist }, budget });
    } catch {
      if (slot.task !== task) return;
      const error = job.kind === 'bundle'
        ? 'The browser could not open Contents/Info.plist in this app folder.'
        : 'The browser could not open this input.';
      this.#finishError(task, error);
      this.#idle(slot);
    }
  }

  async #sendExecutable(slot, task, name) {
    let file;
    try {
      file = await task.job.getExecutable(name);
    } catch {
      // The worker returns the parsed metadata alongside its missing-file result.
    }
    if (slot.task === task) slot.worker.postMessage({ type: 'executable', file });
  }

  #finishError(task, error) {
    task.update({
      type: 'done',
      result: emptyResult('source_error', error, task.job.file?.size),
      source: 'Browser',
      elapsed: 0,
    });
  }

  #retire(slot) {
    clearTimeout(slot.idleTimer);
    slot.worker.terminate();
    this.#slots.delete(slot);
  }

  #idle(slot) {
    slot.task = null;
    slot.idleTimer = setTimeout(() => this.#retire(slot), 10_000);
    this.#schedule();
  }
}

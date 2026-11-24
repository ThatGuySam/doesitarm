// The smoke page loads this wrapper around the same worker used in production.
import './scan-worker.js';

const nativePost = self.postMessage.bind(self);
const read = Blob.prototype.arrayBuffer;
let active;

self.addEventListener('message', ({ data }) => {
  if (!data.job) return;
  active = { id: data.id, label: data.job.label, firstRead: null, yields: 0 };
});

Blob.prototype.arrayBuffer = async function () {
  if (active) {
    active.firstRead ??= performance.timeOrigin + performance.now();
    const delay = active.label.startsWith('hold-') ? 850 :
      active.label.startsWith('timer-') && this.size === 65_536 ? 480 : 0;
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return read.call(this);
};

if (globalThis.scheduler?.postTask) {
  const postTask = scheduler.postTask.bind(scheduler);
  scheduler.postTask = (callback, options) => {
    if (active && options?.priority === 'background') active.yields += 1;
    return postTask(callback, options);
  };
}

self.postMessage = (message, ...rest) => {
  if (active && message.type === 'done') {
    nativePost({ type: 'ui-probe', record: { ...active, ended: performance.timeOrigin + performance.now() } });
    active = undefined;
  }
  nativePost(message, ...rest);
};

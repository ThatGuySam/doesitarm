// Wraps the production scan worker and slows reads for named jobs, so a count or screenshot
// can catch a batch mid-scan. Used only by scripts/count-elements.mjs.
import './scan-worker.js';

const slow = new Set((new URL(self.location.href).searchParams.get('slow') ?? '').split(',').filter(Boolean));
const read = Blob.prototype.arrayBuffer;
let label;

self.addEventListener('message', ({ data }) => {
  if (data.job) label = data.job.label;
});

Blob.prototype.arrayBuffer = async function () {
  if (slow.has(label)) await new Promise((resolve) => setTimeout(resolve, 700));
  return read.call(this);
};

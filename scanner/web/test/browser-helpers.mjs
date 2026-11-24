import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { closeSync, openSync, readFileSync, statSync, writeSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fixture } from './helpers.mjs';

const MiB = 1024 ** 2;
const minimumAvailable = 2560 * MiB;
const maximumBrowserRss = 2500 * MiB;

export function sparseFat(path) {
  const data = readFileSync(fixture('fat64.macho'));
  const offset = 4 * 1024 ** 3 + 4096;
  const size = 5 * 1024 ** 3;
  execFileSync('truncate', ['-s', String(size), path]);
  const headerAndArm = data.subarray(0, 1024);
  headerAndArm.writeBigUInt64BE(BigInt(offset), 16);
  const fd = openSync(path, 'r+');
  try {
    writeSync(fd, headerAndArm, 0, headerAndArm.length, 0);
    writeSync(fd, data, 1024, data.length - 1024, offset);
  } finally {
    closeSync(fd);
  }
  assert.equal(statSync(path).size, size);
  assert.ok(statSync(path).blocks * 512 < 64 * 1024);
  return { offset, size };
}

export async function browserMemory(session) {
  const { processInfo } = await session.send('SystemInfo.getProcessInfo');
  const samples = await Promise.allSettled(processInfo.map(({ id }) => readFile(`/proc/${id}/smaps_rollup`, 'utf8')));
  return samples.reduce((sum, sample) => {
    if (sample.status !== 'fulfilled') return sum;
    sum.rss += memoryLine(sample.value, 'Rss');
    sum.pss += memoryLine(sample.value, 'Pss');
    return sum;
  }, { rss: 0, pss: 0 });
}

function memoryLine(text, label) {
  return Number(new RegExp(`^${label}:\\s+(\\d+)`, 'm').exec(text)?.[1] ?? 0) * 1024;
}

export async function availableMemory() {
  return memoryLine(await readFile('/proc/meminfo', 'utf8'), 'MemAvailable');
}

export async function requireBrowserHeadroom() {
  const available = await availableMemory();
  assert.ok(available >= minimumAvailable, `Available memory ${Math.round(available / MiB)} MiB fell below 2.5 GiB.`);
  return available;
}

export async function monitorChromiumMemory(browser, onSample = () => {}) {
  const session = await browser.newBrowserCDPSession();
  let pending;
  let failure;
  async function sample() {
    const [processes, available] = await Promise.all([browserMemory(session), requireBrowserHeadroom()]);
    onSample({ ...processes, available });
    assert.ok(processes.rss < maximumBrowserRss, `Chromium RSS ${Math.round(processes.rss / MiB)} MiB exceeded 2.5 GB.`);
  }
  await sample();
  const timer = setInterval(() => {
    if (pending || failure) return;
    pending = sample().catch((error) => {
      failure = error;
      void browser.close().catch(() => {});
    }).finally(() => { pending = null; });
  }, 250);
  return {
    get failure() { return failure; },
    async stop() {
      clearInterval(timer);
      await pending;
      await session.detach().catch(() => {});
    },
  };
}

export async function processMemory(session) {
  return (await browserMemory(session)).pss;
}

export async function dropPaths(page, session, paths) {
  const zone = page.locator('#drop-zone');
  await zone.scrollIntoViewIfNeeded();
  const bounds = await zone.boundingBox();
  const x = Math.round(bounds.x + bounds.width / 2);
  const y = Math.round(bounds.y + bounds.height / 2);
  const data = { items: [], files: paths, dragOperationsMask: 1 };
  for (const type of ['dragEnter', 'dragOver', 'drop']) {
    await session.send('Input.dispatchDragEvent', { type, x, y, data });
  }
}

export async function workerHeap(session, targetId) {
  const { sessionId } = await session.send('Target.attachToTarget', { targetId, flatten: false });
  const { promise, resolve, reject } = Promise.withResolvers();
  const response = (event) => {
    if (event.sessionId !== sessionId) return;
    const reply = JSON.parse(event.message);
    if (reply.id !== 1) return;
    if (reply.error) reject(new Error(reply.error.message));
    else resolve(reply.result);
  };
  session.on('Target.receivedMessageFromTarget', response);
  const timer = setTimeout(() => reject(new Error('Timed out reading the worker heap')), 3_000);
  try {
    const [, heap] = await Promise.all([
      session.send('Target.sendMessageToTarget', {
        sessionId, message: JSON.stringify({ id: 1, method: 'Runtime.getHeapUsage' }),
      }),
      promise,
    ]);
    return heap;
  } finally {
    clearTimeout(timer);
    session.off('Target.receivedMessageFromTarget', response);
    await session.send('Target.detachFromTarget', { sessionId });
  }
}

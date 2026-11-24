import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { closeSync, openSync, readFileSync, statSync, writeSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fixture } from './helpers.mjs';

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

export async function processMemory(session) {
  const { processInfo } = await session.send('SystemInfo.getProcessInfo');
  const samples = await Promise.allSettled(processInfo.map(({ id }) => readFile(`/proc/${id}/smaps_rollup`, 'utf8')));
  return samples.reduce((sum, sample) => {
    if (sample.status !== 'fulfilled') return sum;
    return sum + Number(/^Pss:\s+(\d+)/m.exec(sample.value)?.[1] ?? 0);
  }, 0) * 1024;
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

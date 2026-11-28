// Honest wording for scans that are taking a long time. Nothing here limits or
// stops a scan; it only says what is happening and when a Cancel makes sense.
export const SLOW_AFTER = 15_000;

export const isSlow = (startedAt, now) => startedAt !== null && now - startedAt >= SLOW_AFTER;

// The tail of a batch is when nothing is waiting and every running scan has
// been going for a while. Finished results are never part of a Cancel here.
export function tailState({ started, queued, now }) {
  const running = started.length;
  const slow = started.filter((at) => isSlow(at, now)).length;
  return { running, slow, tail: queued === 0 && running > 0 && slow === running };
}

export function countPhrase(state) {
  const { running, tail } = state;
  return `${running.toLocaleString('en-US')} ${tail ? 'still scanning' : 'scanning'}`;
}

export function cancelLabel(state) {
  return state.tail ? `Cancel ${state.running.toLocaleString('en-US')} still scanning` : 'Cancel all';
}

export function rowStatus(startedAt, now, remote = false) {
  if (remote) return 'Scanning on Cloudflare';
  return isSlow(startedAt, now) ? 'Still working' : 'Scanning';
}

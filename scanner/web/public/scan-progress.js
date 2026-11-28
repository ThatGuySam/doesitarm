const SECOND = 1_000;

export function formatDuration(milliseconds) {
  const elapsed = Math.max(0, Math.floor(milliseconds / SECOND));
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor(elapsed / 60) % 60;
  const seconds = String(elapsed % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

export function recordSample(samples, now, bytes) {
  const last = samples.at(-1);
  if (last && (bytes <= last.bytes || now <= last.now)) return samples;
  return [...samples.filter((sample) => now - sample.now <= 4 * SECOND), { now, bytes }];
}

export function estimateRemaining(samples, now, bytes, total) {
  if (!(total > bytes) || samples.length < 3 || now - samples.at(-1).now > 1500) return null;
  const first = samples[0];
  const last = samples.at(-1);
  const interval = last.now - first.now;
  if (interval < 2 * SECOND) return null;

  const rates = samples.slice(1).map((sample, index) => {
    const previous = samples[index];
    return (sample.bytes - previous.bytes) / (sample.now - previous.now);
  });
  const slowest = Math.min(...rates);
  if (slowest <= 0 || Math.max(...rates) > 1.5 * slowest) return null;
  return SECOND * Math.ceil((total - bytes) * interval / ((last.bytes - first.bytes) * SECOND));
}

export function estimateBatch(queued, activeEstimates) {
  if (queued || !activeEstimates.length || activeEstimates.some((estimate) => estimate === null)) return null;
  return Math.max(...activeEstimates);
}

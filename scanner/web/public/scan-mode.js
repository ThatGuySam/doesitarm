export function scanMode({ cores = 1, visible, focused, gentle, conserve }) {
  if (gentle || conserve || !visible || !focused) {
    return { passive: true, limit: !gentle && !conserve && cores >= 5 ? 2 : 1 };
  }
  return { passive: false, limit: Math.min(6, Math.max(1, cores - 2)) };
}

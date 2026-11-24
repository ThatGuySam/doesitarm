const encodedHome = /(?:[a-z](?::|%3a))?(?:%2f|%5c)(?:users|home)(?:%2f|%5c)(?:(?!%2f|%5c)[^/\\\r\n\0])+(?:%2f|%5c|$)/gi;
const windowsHome = /(?<![a-z0-9])[a-z]:[\\/]+users[\\/]+[^/\\\r\n\0]+(?:[\\/]+|$)/gi;
const unixHome = /(?:^|\/)(?:users|home)\/+[^/\\\r\n\0]+(?=\/|$)/gi;

export function redactPath(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(encodedHome, (match) => /%(?:2f|5c)$/i.test(match) ? '/Users/<user>/' : '/Users/<user>')
    .replace(windowsHome, (match) => /[\\/]$/.test(match) ? '/Users/<user>/' : '/Users/<user>')
    .replace(unixHome, '/Users/<user>');
}

function redactHex(value, limit) {
  if (typeof value !== 'string' || !/^(?:[0-9a-f]{2})+$/i.test(value)) return value;
  // Use byte values directly so opaque binary data round-trips unchanged.
  const bytes = value.replace(/../g, (pair) => String.fromCharCode(parseInt(pair, 16)));
  const safe = redactPath(bytes);
  if (safe === bytes) return value;
  return safe.slice(0, limit).replace(/[\s\S]/g, (character) => character.charCodeAt(0).toString(16).padStart(2, '0'));
}

function redactPaths(value) {
  if (!value || typeof value !== 'object') return redactPath(value);
  if (Array.isArray(value)) return value.map(redactPaths);
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    redactPath(key),
    key === 'executable_prefix_hex' || (key === 'value' && value.$plist === 'data_hex')
      ? redactHex(child, key === 'executable_prefix_hex' ? 64 : undefined)
      : redactPaths(child),
  ]));
}

export function stringifyRedacted(value, space) {
  return JSON.stringify(redactPaths(value), null, space);
}

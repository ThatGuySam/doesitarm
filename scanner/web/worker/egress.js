import ipaddr from 'ipaddr.js';
import { discard, RangeFailure } from '../public/range-scan.js';

const USER_AGENT = 'DoesItARM-Scanner/0.1';
const MAX_SUBREQUESTS = 36;
const MAX_REDIRECTS = 6;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const GLOBAL_IPV6 = ipaddr.IPv6.parse('2000::');

function blocked(message) {
  return new RangeFailure(message, 'source_error', 400);
}

function isPublicAddress(text) {
  if (!ipaddr.isValid(text)) return false;
  const address = ipaddr.parse(text);
  return address.range() === 'unicast' &&
    (address.kind() === 'ipv4' || address.match(GLOBAL_IPV6, 3));
}

export function validateTarget(raw, ownHost, base) {
  let url;
  try {
    if (!raw || raw.length > 4096) throw new Error();
    url = new URL(raw, base);
  } catch {
    throw blocked('Provide a valid public HTTPS download URL.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '80')) {
    throw blocked('Downloads require HTTPS on port 443 or 80, without URL credentials.');
  }

  const name = url.hostname.replace(/^\[|\]$|\.$/g, '');
  if (ipaddr.isValid(name)) {
    if (!isPublicAddress(name)) throw blocked('Private and reserved addresses are blocked.');
    // Workers fetch does not support literal IP origins.
    throw blocked('Use the public hostname of the download.');
  }
  if (name === ownHost || !name.includes('.') || /\.(?:local|localhost|internal|lan|home\.arpa)$/.test(name)) {
    throw blocked('This download hostname is blocked.');
  }
  url.hash = '';
  return url;
}

async function dnsAddresses(host, type, subrequest) {
  const endpoint = new URL('https://cloudflare-dns.com/dns-query');
  endpoint.searchParams.set('name', host);
  endpoint.searchParams.set('type', type);
  const response = await subrequest(endpoint, { headers: { Accept: 'application/dns-json' } });
  if (!response.ok) {
    discard(response);
    throw new RangeFailure('Public DNS lookup failed.');
  }
  // This body comes only from the fixed public resolver, never the download origin.
  const records = await response.json();
  if (records.Status !== 0) throw new RangeFailure('The download hostname did not resolve in public DNS.');
  return (records.Answer ?? [])
    .filter((record) => record.type === 1 || record.type === 28)
    .map((record) => record.data);
}

export function createEgress({ target, ownHost, outbound, signal }) {
  let url = target;
  let requests = 0;
  let pinned = false;
  const checked = new Set();

  function subrequest(url, options) {
    signal.throwIfAborted();
    requests += 1;
    if (requests > MAX_SUBREQUESTS) {
      throw new RangeFailure('Scan reached the 36-subrequest limit.', 'limit_reached', 503);
    }
    return outbound(url, { ...options, redirect: 'manual', signal });
  }

  async function checkDNS(host) {
    if (checked.has(host)) return;
    const addresses = [
      ...await dnsAddresses(host, 'A', subrequest),
      ...await dnsAddresses(host, 'AAAA', subrequest),
    ];
    if (!addresses.length) throw new RangeFailure('The download hostname has no public DNS addresses.');
    if (addresses.some((address) => !isPublicAddress(address))) {
      throw blocked('The download hostname resolves to a private or reserved address.');
    }
    checked.add(host);
  }

  return async (range, etag) => {
    const headers = new Headers({ Range: range, 'Accept-Encoding': 'identity', 'User-Agent': USER_AGENT });
    if (etag) headers.set('If-Match', etag);
    const visited = new Set();
    while (true) {
      if (visited.has(url.href)) {
        throw new RangeFailure('The download origin returned a redirect loop.', 'limit_reached', 503);
      }
      visited.add(url.href);
      await checkDNS(url.hostname);
      const response = await subrequest(url, { headers, cache: 'no-store' });
      if (signal.aborted) {
        discard(response);
        signal.throwIfAborted();
      }
      if (response.status === 206) {
        pinned = true;
        return response;
      }
      if (!REDIRECTS.has(response.status)) {
        discard(response);
        throw new RangeFailure('The download origin did not provide a usable byte range.');
      }
      discard(response);
      if (pinned) throw new RangeFailure('The download origin changed during the scan.');
      if (visited.size > MAX_REDIRECTS) {
        throw new RangeFailure('Scan reached the six-redirect limit.', 'limit_reached', 503);
      }
      url = validateTarget(response.headers.get('Location'), ownHost, url);
    }
  };
}

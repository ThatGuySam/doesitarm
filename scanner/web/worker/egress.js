import ipaddr from 'ipaddr.js';
import { discard, RangeFailure } from '../public/range-scan.js';
import { readBounded } from './http-body.js';

const MAX_SUBREQUESTS = 36;
const MAX_REDIRECTS = 3;
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

async function dnsAddresses(host, type, subrequest, signal) {
  const endpoint = new URL('https://cloudflare-dns.com/dns-query');
  endpoint.searchParams.set('name', host);
  endpoint.searchParams.set('type', type);
  const response = await subrequest(endpoint, { headers: { Accept: 'application/dns-json', 'Accept-Encoding': 'identity' } });
  if (!response.ok) {
    discard(response);
    throw new RangeFailure('Public DNS lookup failed.');
  }
  // This body comes only from the fixed public resolver, never the download origin.
  const records = JSON.parse(new TextDecoder().decode(await readBounded(response, 32_768, signal)));
  if (records.Status !== 0) throw new RangeFailure('The download hostname did not resolve in public DNS.');
  return (records.Answer ?? [])
    .filter((record) => record.type === 1 || record.type === 28)
    .map((record) => record.data);
}

export function validatePageTarget(raw, ownHost, base) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  const authority = /^(?:https:)?\/\/([^/?#]*)/i.exec(text)?.[1];
  if (new TextEncoder().encode(text).length > 4096 || /[\\\u0000-\u0020\u007f]/.test(text) ||
      (!authority && (!base || /^(?:https:)?\/\//i.test(text))) ||
      (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^https:\/\//i.test(text)) ||
      authority?.includes('@')) {
    throw blocked('Provide a valid public HTTPS download URL.');
  }
  let url;
  try { url = new URL(text, base); } catch { throw blocked('Provide a valid public HTTPS download URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw blocked('Downloads require HTTPS on port 443, without URL credentials.');
  }
  const host = url.hostname.replace(/^\[|\]$|\.$/g, '');
  if (ipaddr.isValid(host)) {
    if (!isPublicAddress(host)) throw blocked('Private and reserved addresses are blocked.');
    throw blocked('Use the public hostname of the download.');
  }
  if (!host.includes('.') || /\.(?:local|localhost|internal|lan|test|invalid|example|onion|alt|arpa|corp|home|localdomain|intranet)$/.test(host) ||
      host === 'cloudflare-dns.com' || host === ownHost?.replace(/\.$/, '') ||
      host.split('.').some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw blocked('Provide a valid public HTTPS download URL.');
  }
  url.hostname = host;
  url.hash = '';
  if (new TextEncoder().encode(url.href).length > 4096) throw blocked('The URL is too long.');
  return url;
}

function checkedDNS(subrequest, signal) {
  const checked = new Set();
  return async function validateDNS(host, refresh = false) {
    if (!refresh && checked.has(host)) return;
    const records = await Promise.all([
      dnsAddresses(host, 'A', subrequest, signal),
      dnsAddresses(host, 'AAAA', subrequest, signal),
    ]);
    const addresses = records.flat();
    if (!addresses.length) throw new RangeFailure('The download hostname has no public DNS addresses.');
    if (addresses.some((address) => !isPublicAddress(address))) {
      throw blocked('The download hostname resolves to a private or reserved address.');
    }
    checked.add(host);
  };
}

export function createPageEgress({ ownHost, outbound, signal, permitHost, freshDNS = true, maxOrigins = 10, maxRequests = 24, maxRedirects = 4 }) {
  let requests = 0;
  let origins = 0;
  let redirects = 0;
  function subrequest(url, options) {
    signal.throwIfAborted();
    if (++requests > maxRequests) throw new RangeFailure('The download reached its request limit.', 'limit_reached', 422);
    return outbound(url, { ...options, redirect: 'manual', signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  }
  const checkDNS = checkedDNS(subrequest, signal);
  return async function get(raw, { range, etag, revalidate, accept, within } = {}) {
    let url = validatePageTarget(raw.toString(), ownHost);
    const visited = new Set();
    const headers = new Headers({ 'Accept-Encoding': 'identity' });
    if (accept) headers.set('Accept', accept);
    if (range) headers.set('Range', range);
    if (etag) headers.set('If-Match', etag);
    if (revalidate) headers.set('If-None-Match', revalidate);
    for (let hop = 0; ; hop++) {
      signal.throwIfAborted();
      if (visited.has(url.href) || (within && !within(url))) {
        throw blocked('The download redirected outside the allowed route.');
      }
      visited.add(url.href);
      if (++origins > maxOrigins) throw new RangeFailure('The download reached its request limit.', 'limit_reached', 422);
      await permitHost(url.hostname);
      await checkDNS(url.hostname, freshDNS || hop > 0);
      const response = await subrequest(url, { headers, cache: 'no-store', method: 'GET' });
      if (signal.aborted) {
        discard(response);
        signal.throwIfAborted();
      }
      if (!REDIRECTS.has(response.status)) return { url, response };
      discard(response);
      if (hop >= MAX_REDIRECTS || ++redirects > maxRedirects) {
        throw new RangeFailure('The download reached its redirect limit.', 'limit_reached', 422);
      }
      url = validatePageTarget(response.headers.get('Location'), ownHost, url);
      // A conditional validator belongs to the selected resource and origin.
      headers.delete('If-None-Match');
    }
  };
}

export function createEgress({ target, ownHost, outbound, signal }) {
  let url = target;
  let requests = 0;
  let redirects = 0;
  let redirected = false;

  function subrequest(url, options) {
    signal.throwIfAborted();
    requests += 1;
    if (requests > MAX_SUBREQUESTS) {
      throw new RangeFailure('Scan reached the 36-subrequest limit.', 'limit_reached', 503);
    }
    return outbound(url, { ...options, redirect: 'manual', signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  }

  const checkDNS = checkedDNS(subrequest, signal);

  return async (range, etag) => {
    const headers = new Headers({ Range: range, 'Accept-Encoding': 'identity' });
    if (etag) headers.set('If-Match', etag);
    while (true) {
      await checkDNS(url.hostname, redirected);
      redirected = false;
      const response = await subrequest(url, { headers, cache: 'no-store' });
      if (signal.aborted) {
        discard(response);
        signal.throwIfAborted();
      }
      if (response.status === 206) return response;
      if (!REDIRECTS.has(response.status)) {
        discard(response);
        throw new RangeFailure('The download origin did not provide a usable byte range.');
      }
      discard(response);
      redirects += 1;
      if (redirects > MAX_REDIRECTS) {
        throw new RangeFailure('Scan reached the three-redirect limit.', 'limit_reached', 503);
      }
      url = validatePageTarget(response.headers.get('Location'), ownHost, url);
      redirected = true;
    }
  };
}

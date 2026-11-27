// doesitarm-youtube-extract: hosts yt-dlp in a Dynamic Worker sandbox.
//
// This Worker has one binding (LOADER), no secrets, no vars and no route. Other
// Workers call it through a service binding with a job (see src/extract.py):
// one line of JSON, a newline, then optional wheel bytes. It answers JSON.
//
// yt-dlp runs in a Dynamic Worker (Python) whose env holds only the wheel bytes
// and labels, and whose globalOutbound is YouTubeGateway: the runtime routes every
// fetch() and connect() from the sandbox through it, so js.fetch or raw sockets
// cannot reach any other host. One Dynamic Worker ID per wheel digest and code
// version, so different yt-dlp versions never share an isolate.

import { WorkerEntrypoint } from "cloudflare:workers";
// Both written by scripts/vendor.sh (not committed): the pinned, digest-checked wheel.
import bundledWheel from "./bundled.whl";
import { BUNDLED_VERSION } from "./bundled.js";
import sandboxPy from "../src/sandbox.py";
import extractPy from "../src/extract.py";
import transportPy from "../src/transport.py";
import loaderPy from "../src/loader.py";
import canaryPy from "../src/canary.py";
import normalizePy from "../src/normalize.py";

const MODULES = {
  "sandbox.py": sandboxPy,
  "extract.py": extractPy,
  "transport.py": transportPy,
  "loader.py": loaderPy,
  "canary.py": canaryPy,
  "normalize.py": normalizePy,
};
const ALLOWED_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "consent.youtube.com"]);
const COMPATIBILITY_DATE = "2026-11-23";
const LIMITS = { cpuMs: 120000, subRequests: 400 };
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

// Blocked egress attempts seen by the gateway, by sandbox ID (best effort, per isolate).
const blocked = new Map();
// Wheel bytes received from callers, by digest (at most two kept).
const wheels = new Map();
let codeVersion = null;
let bundledSha = null;

const hex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (bytes) => hex(await crypto.subtle.digest("SHA-256", bytes));
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });

export class YouTubeGateway extends WorkerEntrypoint {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname) || (url.port && url.port !== "443")) {
      const id = this.ctx.props.sandbox;
      const list = blocked.get(id) || [];
      list.push(`${url.protocol}//${url.hostname}${url.port ? ":" + url.port : ""}`);
      blocked.set(id, list.slice(-20));
      console.log("egress blocked", id, url.hostname);
      return new Response("egress blocked by doesitarm-youtube-extract", { status: 403 });
    }
    return fetch(request);
  }

  async connect() {
    throw new Error("raw sockets are blocked by doesitarm-youtube-extract");
  }
}

async function ensureVersions() {
  if (!codeVersion) {
    const text = Object.entries(MODULES).map(([name, body]) => `${name}\n${body}`).join("\n\0\n");
    codeVersion = (await sha256(new TextEncoder().encode(text))).slice(0, 16);
  }
  if (!bundledSha) bundledSha = await sha256(bundledWheel);
}

function sandboxFor(env, ctx, wheel) {
  const id = `yt-extract:${codeVersion}:${wheel.sha256}`;
  const stub = env.LOADER.get(id, async () => ({
    compatibilityDate: COMPATIBILITY_DATE,
    compatibilityFlags: ["python_workers"],
    mainModule: "sandbox.py",
    modules: Object.fromEntries(Object.entries(MODULES).map(([name, body]) => [name, { py: body }])),
    env: {
      WHEEL_VERSION: wheel.version,
      WHEEL_SHA256: wheel.sha256,
      WHEEL_SOURCE: wheel.source,
    },
    globalOutbound: ctx.exports.YouTubeGateway({ props: { sandbox: id } }),
    limits: LIMITS,
  }));
  return { id, stub };
}

async function runIn(env, ctx, wheel, jobLine) {
  const { id, stub } = sandboxFor(env, ctx, wheel);
  const before = (blocked.get(id) || []).length;
  const started = Date.now();
  const call = (body) => stub.getEntrypoint().fetch("https://sandbox.internal/", { method: "POST", body });
  let reply = await call(jobLine);
  let text = await reply.text();
  if (text.startsWith('{"need_wheel"')) {
    const head = new TextEncoder().encode(jobLine + "\n");
    const both = new Uint8Array(head.length + wheel.bytes.byteLength);
    both.set(head, 0);
    both.set(new Uint8Array(wheel.bytes), head.length);
    reply = await call(both);
    text = await reply.text();
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: `sandbox reply is not JSON: ${text.slice(0, 200)}` };
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) data = { error: "sandbox reply is not an object" };
  data.sandbox = { id, ms: Date.now() - started };
  const newBlocks = (blocked.get(id) || []).slice(before);
  if (newBlocks.length) data.egress_blocked = newBlocks;
  return { status: reply.status, data };
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") return json({ error: "POST a job" }, 405);
    await ensureVersions();
    const body = new Uint8Array(await request.arrayBuffer());
    const newline = body.indexOf(10);
    const jobLine = new TextDecoder().decode(newline < 0 ? body : body.subarray(0, newline));
    const tail = newline < 0 ? null : body.slice(newline + 1);
    let job;
    try {
      job = JSON.parse(jobLine);
      if (job === null || typeof job !== "object" || Array.isArray(job)) throw new Error("job must be an object");
    } catch (err) {
      return json({ error: String(err).slice(0, 300) }, 400);
    }

    const bundled = { version: BUNDLED_VERSION, sha256: bundledSha, bytes: bundledWheel, source: "bundled" };
    let wheel = bundled;
    const spec = job.wheel;
    if (spec && spec.sha256 !== bundledSha) {
      if (typeof spec.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(spec.sha256) ||
          typeof spec.version !== "string" || !/^[0-9.]+(dev\d+)?$/.test(spec.version)) {
        return json({ error: "bad wheel spec" }, 400);
      }
      let bytes = tail && tail.length ? tail.buffer : wheels.get(spec.sha256);
      if (!bytes) return json({ need_wheel: true }, 409);
      if ((await sha256(bytes)) !== spec.sha256) return json({ error: "wheel bytes do not match sha256" }, 400);
      wheels.set(spec.sha256, bytes);
      while (wheels.size > 2) wheels.delete(wheels.keys().next().value);
      wheel = { version: spec.version, sha256: spec.sha256, bytes, source: "wheel" };
    }
    const sandboxJob = JSON.stringify({ ...job, wheel: wheel.source === "wheel" ? job.wheel : null });

    let result = await runIn(env, ctx, wheel, sandboxJob);
    if (result.data.wheel_failed && wheel.source === "wheel") {
      const reason = result.data.wheel_failed;
      const blockedFirst = result.data.egress_blocked;
      result = await runIn(env, ctx, bundled, JSON.stringify({ ...job, wheel: null }));
      if (result.data.ytdlp) result.data.ytdlp.fallback_reason = reason;
      if (job.op === "canary") {
        // The requested wheel did not load; a bundled pass must not count for it.
        result.data.ok = false;
        result.data.failure_classes = [...new Set([...(result.data.failure_classes || []), "upstream_broke"])].sort();
      }
      if (blockedFirst) result.data.egress_blocked = [...blockedFirst, ...(result.data.egress_blocked || [])];
    }
    return json(result.data, result.status);
  },
};

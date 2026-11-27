"""Main module of the yt-dlp Dynamic Worker (loaded by extract/host.js).

The host loads this Worker with an env holding only the wheel's version, digest
and source label (env is capped at 1 MB, so the wheel bytes come in the body), and a globalOutbound gateway that lets fetch() and
connect() reach YouTube hosts only. One Dynamic Worker ID per wheel digest, so
each yt-dlp version runs in its own isolates.

The body is one line of job JSON (see extract.py), then optionally the wheel bytes.
If this isolate has not stored the wheel yet and no bytes came, the answer is
{"need_wheel": true} and the host resends with them. The answer is JSON.
"""

import json

from workers import Response, WorkerEntrypoint

import extract
import loader

JSON_HEADERS = {"content-type": "application/json; charset=utf-8"}


def reply(data, status=200):
    return Response(json.dumps(data, ensure_ascii=False), status=status, headers=JSON_HEADERS)


class Default(WorkerEntrypoint):

    async def fetch(self, request):
        env = self.env
        version, sha, source = str(env.WHEEL_VERSION), str(env.WHEEL_SHA256), str(env.WHEEL_SOURCE)
        try:
            head, _, wheel_bytes = (await extract.request_bytes(request)).partition(b"\n")
            job = json.loads(head)
            if not isinstance(job, dict):
                raise ValueError("job must be an object")
        except (ValueError, TypeError) as err:
            return reply({"error": f"{type(err).__name__}: {err}"[:300]}, 400)
        try:
            data = None
            if not loader.wheel_cached(version, sha):
                if not wheel_bytes:
                    return reply({"need_wheel": True})
                data = wheel_bytes
            actual = loader.use_wheel(version, sha, data)
        except Exception as err:  # noqa: BLE001 - the host falls back to the bundled wheel
            return reply({"wheel_failed": f"{type(err).__name__}: {err}"[:300]})
        try:
            return reply(extract.run_job(job, {"version": actual, "source": source, "sha256": sha}))
        except (ValueError, TypeError, KeyError) as err:
            return reply({"error": f"{type(err).__name__}: {err}"[:300]}, 400)

"""Turn a saved youtube-videos.json into snapshot shards and state for the updater.

Run once (or to reset the snapshot), with CPython:
    python3 -I scripts/seed_snapshot.py OLD.json OUT_DIR
then upload OUT_DIR/state.json and OUT_DIR/shards/*.json to R2 under snapshot/ (README).
The updater cannot do this itself: parsing the whole file needs more memory than a
Python Worker isolate has.
"""

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import snapshot  # noqa: E402
from sources import SOURCES  # noqa: E402


def main(old_path, out_dir):
    old = json.loads(Path(old_path).read_text())
    now = int(time.time())
    state = snapshot.seed_state(old, SOURCES, now)
    members = snapshot.membership(SOURCES, state)
    shards = [dict() for _ in range(snapshot.SHARDS)]
    for vid, entry in old.items():
        shards[snapshot.shard_of(vid)][vid] = entry
    out = Path(out_dir)
    (out / "shards").mkdir(parents=True, exist_ok=True)
    for index, shard in enumerate(shards):
        snapshot.fix_shard(shard, members, state)
        (out / "shards" / f"{index:02d}.json").write_text(
            json.dumps(shard, ensure_ascii=False, separators=(",", ":")))
    (out / "state.json").write_text(json.dumps(state))
    count, newest = snapshot.summary(state, members)
    print(f"{count} videos in {snapshot.SHARDS} shards, newest publishedAt {newest}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

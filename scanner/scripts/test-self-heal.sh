#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.cargo/bin:$HOME/.local/share/mise/installs/node/latest/bin:$PATH"
repo=$(git -C "$(dirname -- "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
bin=$(realpath -e -- "${SOURCES_BIN:-$repo/scanner/target/debug/sources}")
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
case_repo="$scratch/checkout"
run="$scratch/run"
mkdir -p -- "$case_repo"
git -C "$repo" archive HEAD | tar -x -C "$case_repo"
cp -- "$repo/scanner/scripts/self-heal.sh" "$case_repo/scanner/scripts/self-heal.sh"
git -C "$case_repo" init --quiet --initial-branch=master
git -C "$case_repo" -c core.hooksPath=/dev/null add --all
git -C "$case_repo" -c core.hooksPath=/dev/null -c user.name=Fixture -c user.email=fixture@example.org commit --quiet \
    -m 'test: establish a disposable scanner baseline' -m 'Co-Authored-By: Codex <noreply@openai.com>'

cat >"$scratch/seeds.txt" <<'SEEDS'
https://example.org/viewer.sh
SEEDS
cat >"$scratch/fixture.json" <<'FIXTURE'
{
  "responses": [{
    "url": "https://example.org/viewer.sh",
    "mode": "metadata",
    "status": 200,
    "headers": {"content-type": "text/plain"},
    "body_text": "viewer)\n  name=Viewer\n  export downloadURL=\"https://downloads.example.org/viewer.dmg\"\n  ;;\n"
  }],
  "assets": {
    "https://downloads.example.org/viewer.dmg": {"hex": "aa"}
  }
}
FIXTURE
"$bin" run --connector installomator --input "$scratch/seeds.txt" --out "$run" --fixture "$scratch/fixture.json" --limit 1 >/dev/null
"$bin" triage --dir "$run"
cp -- "$scratch/fixture.json" "$run/agent-tasks/recipe_requires_resolution.replay.json"

# The stub first proves its filesystem and socket restrictions, then applies
# one of two small patches directly to the disposable agent checkout.
printf 'outside sentinel\n' >"$scratch/outside"
{
    printf '#!/usr/bin/env bash\nset -euo pipefail\n'
    printf 'outside=%q\n' "$scratch/outside"
    cat <<'STUB'
if printf 'changed\n' >>"$outside" 2>/dev/null; then
    echo 'Outside write was allowed' >&2
    exit 10
fi
if chmod 000 "$outside" 2>/dev/null; then
    echo 'Outside chmod was allowed' >&2
    exit 11
fi
python3 - <<'PY'
import socket
try:
    socket.socket()
except PermissionError:
    pass
else:
    raise SystemExit('Socket creation was allowed')
PY
python3 - "$1" <<'PY'
from pathlib import Path
import sys
src = Path('scanner/crates/source-tools/src/connectors/installomator.rs')
text = src.read_text()
anchor = 'for line in text.lines().map(str::trim) {'
assert anchor in text
prefix = 'export ' if sys.argv[1] == 'good' else 'declare '
replacement = anchor + f'\n            let line = line.strip_prefix("{prefix}").unwrap_or(line);'
src.write_text(text.replace(anchor, replacement))
PY
prefix=declare
if [[ $1 == good ]]; then prefix=export; fi
cat >scanner/crates/source-tools/tests/fixtures/exported-recipe.json <<FIXTURE
{"responses":[{"url":"https://example.org/viewer.sh","mode":"metadata","status":200,
"body_text":"$prefix downloadURL='https://downloads.example.org/viewer.dmg'"}]}
FIXTURE
cat >scanner/crates/source-tools/tests/exported_recipe.rs <<'RUST'
use source_tools::connectors::{ConnectorId, Context, parse_seed};
use source_tools::triage::Fixture;
use std::path::Path;

#[test]
fn resolves_literal_download_url_with_declaration() {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/exported-recipe.json");
    let fixture = Fixture::open(&path).unwrap();
    let seed = parse_seed("https://example.org/viewer.sh").unwrap();
    let connector = ConnectorId::Installomator.connector();
    let rows = connector.discover_one(&seed, &mut Context::new(&fixture, None)).unwrap();
    assert_eq!(rows[0].url, "https://downloads.example.org/viewer.dmg");
}
RUST
STUB
} >"$scratch/stub.sh"
chmod +x "$scratch/stub.sh"

for patch in bad good; do
    export AGENT_CMD="\"\$HEAL_AGENT_BIN\" $patch \"\$1\""
    HEAL_AGENT_BIN="$scratch/stub.sh" SOURCES_BIN="$bin" \
        "$case_repo/scanner/scripts/self-heal.sh" "$run" --limit 1 --budget-secs 240
    if [[ $patch == bad ]]; then
        test -z "$(git -C "$case_repo" status --porcelain=v1)"
        rg -q '"status":"reverted","detail":"replay_not_fixed"' "$run/heal-log.jsonl"
    else
        rg -q '"status":"kept","detail":"tests_and_replay_passed"' "$run/heal-log.jsonl"
        rg -q 'strip_prefix\("export "\)' "$case_repo/scanner/crates/source-tools/src/connectors/installomator.rs"
        test -f "$case_repo/scanner/crates/source-tools/tests/exported_recipe.rs"
    fi
done
test "$(cat "$scratch/outside")" = 'outside sentinel'
test "$(stat -c '%a' "$scratch/outside")" != 0
printf 'Stub replay passed. The bad patch was discarded and the good patch was kept.\n'
cat "$run/heal-log.jsonl"

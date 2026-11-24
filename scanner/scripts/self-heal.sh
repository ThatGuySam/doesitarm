#!/usr/bin/env bash
set -euo pipefail

usage() {
    echo 'Usage: scripts/self-heal.sh DIR [--limit N] [--budget-secs N]'
    echo 'Set AGENT_CMD to an offline command that receives the task path as $1.'
    echo 'See SOURCES.md for the sandbox, replay fixtures, and Codex command template.'
}

if [[ ${1:-} == --help ]]; then usage; exit 0; fi
if (( $# < 1 )); then usage >&2; exit 2; fi
dir=$(realpath -e -- "$1")
shift
limit=5
budget=180
while (( $# )); do
    case $1 in
        --limit) limit=${2:?expected task limit}; shift 2 ;;
        --budget-secs) budget=${2:?expected seconds}; shift 2 ;;
        *) usage >&2; exit 2 ;;
    esac
done
[[ $limit =~ ^[1-9][0-9]{0,3}$ && $budget =~ ^[1-9][0-9]{0,3}$ ]] || {
    echo 'Limit and budget must be positive integers under 10000.' >&2
    exit 2
}

export PATH="$HOME/.cargo/bin:$HOME/.local/share/mise/installs/node/latest/bin:$PATH"
repo=$(git -C "$(dirname -- "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
revision=$(git -C "$repo" rev-parse HEAD)
trusted=$(realpath -e -- "${SOURCES_BIN:-$repo/scanner/target/debug/sources}")
[[ -x $trusted && -d $dir/agent-tasks && ! -L $dir/heal-log.jsonl ]] || {
    echo 'Build the sources binary and generate agent tasks first. The log path must be a regular file.' >&2
    exit 2
}
[[ $(uname -s) == Linux && -x /usr/bin/setpriv && -x /usr/bin/timeout ]] || {
    echo 'The healing runner needs Linux with setpriv, Landlock, seccomp, and GNU timeout.' >&2
    exit 2
}
exec 8<"$repo"
flock --exclusive --nonblock 8 || { echo 'A healing session already holds this worktree.' >&2; exit 2; }
if [[ -n $(git -C "$repo" status --porcelain=v1 --untracked-files=normal) ]]; then
    echo 'Start the healing runner with a clean worktree so its accepted changes have a known base.' >&2
    exit 2
fi

scratch=$(mktemp -d "$repo/.source-heal.XXXXXXXX")
running=
cleanup() {
    if [[ -n $running ]]; then
        kill -KILL -- "-$running" "$running" 2>/dev/null || true
        wait "$running" 2>/dev/null || true
    fi
    rm -rf -- "$scratch"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# The supervisor runs the sandbox launcher and the Git commands. Agent code,
# build scripts, tests, and the candidate binary execute only inside the sandbox.
"$trusted" heal-filter >"$scratch/filter.bpf"
compiler=$(rustup which rustc)
toolchain=$(dirname -- "$compiler")
registry=$(realpath -e -- "${CARGO_HOME:-$HOME/.cargo}/registry")
git_objects=$(git -C "$repo" rev-parse --path-format=absolute --git-path objects)
mkdir "$scratch/control"
git -c init.defaultBranch=master init --quiet --bare "$scratch/control/compare.git"
cp -- "$trusted" "$scratch/control/baseline-sources"

agent_cmd=${AGENT_CMD:-'"${HEAL_AGENT_BIN:-codex}" --ask-for-approval never exec --ephemeral --sandbox workspace-write - < "$1"'}
agent_bin=
if [[ -n ${HEAL_AGENT_BIN:-} ]]; then
    agent_bin=$(realpath -e -- "$HEAL_AGENT_BIN")
    [[ -f $agent_bin && -x $agent_bin ]] || { echo 'HEAL_AGENT_BIN must name a local executable.' >&2; exit 2; }
fi

read_rights=execute,read-file,read-dir
write_rights=$read_rights,write-file,remove-dir,remove-file,make-dir,make-reg,make-sym,make-fifo,refer,truncate

sandbox() {
    local seconds=$1 work=$2 inputs=$3 logged=$4
    shift 4
    local state="$work/.source-heal-state"
    mkdir -p "$state/home/.cargo" "$state/tmp" "$state/target"
    if [[ ! -e $state/home/.cargo/registry ]]; then
        ln -s -- "$registry" "$state/home/.cargo/registry"
    fi
    local rules=(
        --no-new-privs --landlock-access fs
        --landlock-rule "path-beneath:$write_rights:$work"
        --landlock-rule "path-beneath:$read_rights:$inputs"
        --landlock-rule "path-beneath:$read_rights:/usr"
        --landlock-rule "path-beneath:$read_rights:${toolchain%/bin}"
        --landlock-rule "path-beneath:read-file,read-dir:$registry"
        --landlock-rule path-beneath:read-file:/etc/ld.so.cache
        --landlock-rule path-beneath:read-file:/dev/urandom
        --landlock-rule path-beneath:read-file,write-file:/dev/null
        --seccomp-filter "$scratch/filter.bpf"
    )
    local -a agent_env=()
    if [[ -n $agent_bin ]]; then
        rules+=(--landlock-rule "path-beneath:execute,read-file:$agent_bin")
        agent_env+=("HEAL_AGENT_BIN=$agent_bin")
    fi
    local rc=0
    (
        cd -- "$work"
        umask 077
        ulimit -c 0
        exec /usr/bin/timeout --signal=TERM --kill-after=3s "${seconds}s" "$trusted" heal-sandbox -- "${rules[@]}" \
            /usr/bin/env -i PATH="$toolchain:/usr/bin" HOME="$state/home" CARGO_HOME="$state/home/.cargo" \
            CARGO_TARGET_DIR="$state/target" TMPDIR="$state/tmp" CARGO_NET_OFFLINE=true \
            GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null LC_ALL=C "${agent_env[@]}" "$@"
    ) </dev/null >"$logged" 2>&1 &
    running=$!
    wait "$running" || rc=$?
    # timeout leads a process group. Clean up descendants even if the direct child exited.
    kill -KILL -- "-$running" 2>/dev/null || true
    running=
    return "$rc"
}

git_compare() {
    local tree=$1
    shift
    GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null \
    GIT_ALTERNATE_OBJECT_DIRECTORIES="$git_objects" \
        git -C "$tree" --git-dir="$scratch/control/compare.git" --work-tree="$tree" \
        -c core.hooksPath=/dev/null -c core.attributesFile=/dev/null "$@"
}

snapshot() {
    local tree=$1
    mkdir -p -- "$tree"
    git -C "$repo" archive "$revision" | tar -x -C "$tree"
    if [[ -s $scratch/control/accepted.patch ]]; then
        GIT_CEILING_DIRECTORIES="$(dirname -- "$tree")" git -C "$tree" apply -- "$scratch/control/accepted.patch"
    fi
}

permitted_change() {
    local path=$1
    [[ $path =~ ^scanner/crates/source-tools/src/connectors/[a-z_]+\.rs$ ||
       $path =~ ^scanner/crates/source-tools/src/(artifact|http|lib)\.rs$ ||
       $path =~ ^scanner/crates/source-tools/src/http/[a-z_]+\.rs$ ||
       $path =~ ^scanner/crates/source-tools/tests/[a-z_][a-z_0-9]*\.rs$ ||
       $path =~ ^scanner/crates/source-tools/tests/fixtures/[a-zA-Z0-9_.-]+$ ||
       $path =~ ^scanner/scan-core/(src|tests)/[a-z_][a-z_0-9]*\.rs$ ||
       $path =~ ^scanner/fixtures/[a-zA-Z0-9_.-]+$ ]]
}

validate_changes() {
    local tree=$1
    local source=0 regression=0 raw path marker from to mode size
    while IFS=$'\t' read -r raw path; do
        [[ -n $raw ]] || continue
        read -r from to _ _ marker <<<"$raw"
        permitted_change "$path" && [[ $marker == M || $marker == A ]] && [[ $to == 100644 ]] || return 1
        mode=$(stat -c '%F' -- "$tree/$path") || return 1
        [[ $mode == 'regular file' ]] || return 1
        size=$(stat -c '%s' -- "$tree/$path") || return 1
        (( size <= 262144 )) || return 1
        case $path in
            */src/*) source=1 ;;
            */tests/*|scanner/fixtures/*) regression=1 ;;
        esac
    done < <(git_compare "$tree" diff --cached --raw --no-renames "$revision")
    (( source && regression ))
}

log() {
    local class=$1 status=$2 detail=$3
    # All three values are generated by the runner after filename validation.
    printf '{"time":"%s","failure_class":"%s","status":"%s","detail":"%s","base_commit":"%s"}\n' \
        "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$class" "$status" "$detail" "$revision" >>"$dir/heal-log.jsonl"
    printf '%s %s (%s)\n' "$status" "$class" "$detail"
}

remaining() {
    local left=$((deadline - SECONDS))
    (( left > 0 )) || return 1
    printf '%d\n' "$left"
}

attempt() {
    local class=$1 task=$2 fixture=$3
    local job="$scratch/job" deadline=$((SECONDS + budget)) seconds
    rm -rf -- "$job"
    mkdir -p -- "$job/inputs" "$job/agent" "$job/validate"
    if [[ -L $fixture || ! -f $fixture || $(stat -c '%s' -- "$fixture") -gt 262144 ]]; then
        log "$class" skipped missing_or_oversize_offline_fixture
        return
    fi
    if [[ -L $task || ! -f $task || $(stat -c '%s' -- "$task") -gt 262144 ]]; then
        log "$class" skipped invalid_task_file
        return
    fi
    cp -- "$task" "$job/inputs/task.md"
    cp -- "$fixture" "$job/inputs/replay.json"
    cp -- "$scratch/control/baseline-sources" "$job/inputs/baseline-sources"
    local sample reproduced=
    for sample in 1 2 3; do
        seconds=$(remaining) || break
        if (( seconds > 8 )); then seconds=8; fi
        if sandbox "$seconds" "$job/validate" "$job/inputs" "$job/baseline.log" "$job/inputs/baseline-sources" verify \
            --task "$job/inputs/task.md" --fixture "$job/inputs/replay.json" --sample "$sample" --expect-failure; then
            reproduced=$sample
            break
        fi
    done
    if [[ -z $reproduced ]]; then
        log "$class" skipped baseline_did_not_reproduce_or_sandbox_unavailable
        return
    fi
    snapshot "$job/agent"
    seconds=$(remaining) || { log "$class" reverted budget_elapsed; return; }
    if ! sandbox "$seconds" "$job/agent" "$job/inputs" "$job/agent.log" \
        /usr/bin/bash -c "$agent_cmd" source-heal "$job/inputs/task.md"; then
        log "$class" reverted agent_command_failed_or_timed_out
        return
    fi
    rm -rf -- "$job/agent/.source-heal-state"
    git_compare "$job/agent" read-tree "$revision"
    git_compare "$job/agent" add --all -- .
    if ! validate_changes "$job/agent"; then
        log "$class" reverted empty_disallowed_or_untested_patch
        return
    fi
    git_compare "$job/agent" diff --cached --binary --no-ext-diff --no-textconv --no-renames "$revision" \
        >"$job/candidate.patch"
    git_compare "$job/agent" write-tree >"$job/candidate.tree"

    # Validate only the extracted patch, using the original task and fixture
    # outside the writable tree. The agent's files, caches and environment are discarded.
    git -C "$repo" archive "$revision" | tar -x -C "$job/validate"
    GIT_CEILING_DIRECTORIES="$job" git -C "$job/validate" apply -- "$job/candidate.patch"
    seconds=$(remaining) || { log "$class" reverted budget_elapsed; return; }
    local rejected
    if sandbox "$seconds" "$job/validate" "$job/inputs" "$job/validate.log" \
        /usr/bin/bash -c '
            set -eu
            cd scanner
            cargo test --locked --offline -j2 -p scan-core -p source-tools || exit 71
            cargo build --locked --offline -j2 -p source-tools --bin sources || exit 72
            "$CARGO_TARGET_DIR/debug/sources" verify --task "$1" --fixture "$2" --sample "$3" || exit 73
        ' source-heal "$job/inputs/task.md" "$job/inputs/replay.json" "$reproduced"; then
        :
    else
        case $? in
            71) rejected=rust_tests_failed ;;
            72) rejected=scanner_build_failed ;;
            73) rejected=replay_not_fixed ;;
            *) rejected=sandbox_or_budget_failed ;;
        esac
        log "$class" reverted "$rejected"
        tail -n 24 "$job/validate.log" >&2
        return
    fi

    # Apply only the delta since the previous accepted tree. The supervisor's
    # Git index and candidate patch were never writable by the agent or tests.
    local before=$revision
    if [[ -f $scratch/control/accepted.tree ]]; then
        read -r before <"$scratch/control/accepted.tree"
    fi
    git_compare "$job/agent" diff --cached --binary --no-ext-diff --no-textconv --no-renames "$before" >"$job/delta.patch"
    if [[ ! -s $job/delta.patch ]]; then
        log "$class" reverted no_new_patch
        return
    fi
    if ! git -C "$repo" apply --check -- "$job/delta.patch"; then
        log "$class" reverted worktree_changed
        return
    fi
    git -C "$repo" apply -- "$job/delta.patch"
    cp -- "$job/candidate.patch" "$scratch/control/accepted.patch"
    cp -- "$job/candidate.tree" "$scratch/control/accepted.tree"
    cp -- "$job/validate/.source-heal-state/target/debug/sources" "$scratch/control/baseline-sources"
    log "$class" kept tests_and_replay_passed
}

count=0
shopt -s nullglob
for task in "$dir"/agent-tasks/*.md; do
    class=${task##*/}
    class=${class%.md}
    [[ $class =~ ^[A-Za-z][A-Za-z0-9_.:-]{0,127}$ ]] || continue
    if (( count >= limit )); then break; fi
    (( count += 1 ))
    attempt "$class" "$task" "$dir/agent-tasks/$class.replay.json"
done

const README = {
  schema: 'Version 1. JSON has readme, run, and results. In NDJSON the first line has type=run, readme, and run; subsequent lines have type=result and result.',
  run: 'scanner_git_commit is the build revision, scanner_version is the Cargo version, scanner_working_tree_dirty describes tracked build inputs, and wasm_sha256 identifies the browser Wasm bytes. profile and scheduling_mode identify the initial policy; scheduling_modes records every applied policy label. user_agent, platform, hardware_concurrency and device_memory_gib are browser-reported. started_at is UTC. method names the picker or drop API. folder_name is the selected root label. files_seen, directories_seen and skipped_entries count entries exposed by the source. skip_examples contains up to 64 affected paths with a truncation flag. symlink_metadata_available says whether link identity and targets can be inspected. app_bundles is the number of discovered bundles. enumeration_ms covers discovery. scan_ms runs from the first worker start to the last result; it can overlap discovery. Throughput is completed rows or bytes per second over scan_ms. peak_worker_count counts concurrent active scans. long_tasks contains main-thread task offsets and durations in ms where supported. canceled indicates interrupted discovery.',
  identity: 'id identifies a row in this document. stable_id combines input kind and display path for comparisons across runs. display_path begins at the selected folder name. parent_bundle_path identifies the nearest enclosing app. bundle_role describes app, nested_app, wrapper or resource_only. source names the scanner transport.',
  outcome: 'status is the scan outcome and error/error_class describe the failure. format is the detected container. architectures lists slice names, cpu_type, cpu_subtype, offsets and sizes in bytes, header_verified, per-slice minimum macOS and code-signature load-command presence. A signature may be present without being validated. bundle_path, bundle_id, version, name and min_macos describe app metadata. installer, inventory, script_runtime and metadata source/resolution fields may be supplied by the scanner.',
  evidence: 'info_plist is the complete parsed property list when available. Non-JSON plist values are tagged with $plist and value. info_plist_keys are the top-level keys. info_plist_path, info_plist_size and info_plist_encoding describe the source. plist_in_container identifies member-relative paths in an archive. executable_name is CFBundleExecutable; executable_path and executable_size describe its resolution. executable_prefix_hex is up to 64 source bytes. load_commands lists per-slice command ids, sizes and interpreted key fields. directory_listings has Contents and MacOS entries with name, type, size, symlink_target and a truncated marker. candidate_executables and nested_artifacts include paths observed by discovery or the format scanner.',
  reads: 'read_log records attempted reads in order, with the source path, offset, length, purpose and outcome. A logical range split by the browser includes source_chunk entries for physical subranges. bytes_read is the scanner’s successful source coverage, bytes_requested is attempted coverage, decoded_bytes is decoder work, reads counts requests, total_size describes the scanned source, and elapsed_ms measures the row between worker start and completion. Diagnostic-only reads are identifiable in read_log.',
  reproduction: 'Failures supply a relative_path, copy_from_selection, container_member_paths, supporting_paths for other observed candidates or nested artifacts, missing_executable indicator, expected_executable_path when known, expected_status and native CLI command. Use scripts/diagnostics-to-fixtures.mjs to make a skeleton. Copy the listed original files for exact reproduction when metadata and the executable prefix are insufficient.',
  privacy: 'This is generated locally. The username option redacts /Users/<name>/ in JSON text. The only source payloads are parsed Info.plist values and the executable prefix. The browser omits inode and symlink information that the selected API does not expose. null means unavailable or inapplicable.',
};

const encoder = new TextEncoder();
const parts = [];
let mime;
let redact;
let ndjson;
let first = true;
let chunk = '';

const homeInJson = /\/Users\/(?:[^/"\\]|\\(?:u[0-9a-f]{4}|["\\bfnrt]))+\//gi;
const homeInPrefix = /\/Users\/[^/\u0000\r\n]+\//;

function serialize(value) {
  if (redact && value.result) {
    // Skip a raw prefix that itself contains a username-bearing path.
    const hex = value.result.executable_prefix_hex;
    if (hex && typeof hex === 'string') {
      const prefix = String.fromCharCode(...(hex.match(/../g) ?? []).map((pair) => parseInt(pair, 16)));
      if (homeInPrefix.test(prefix)) value.result.executable_prefix_hex = null;
    }
  }
  const json = JSON.stringify(value);
  return redact ? json.replace(homeInJson, '/Users/<user>/') : json;
}

function append(value) {
  chunk += value;
  if (chunk.length >= 128 * 1024) flush();
}

function flush() {
  if (chunk) parts.push(encoder.encode(chunk));
  chunk = '';
}

self.onmessage = ({ data }) => {
  try {
    if (data.header) {
      redact = data.redact;
      ndjson = data.kind === 'ndjson';
      mime = ndjson ? 'application/x-ndjson' : 'application/json';
      const header = serialize({ ...(ndjson ? { type: 'run' } : {}), readme: README, run: data.header });
      append(ndjson ? `${header}\n` : `${header.slice(0, -1)},"results":[\n`);
    } else if (data.records) {
      for (const result of data.records) {
        if (ndjson) append(`${serialize({ type: 'result', result })}\n`);
        else {
          const wrapped = serialize({ result });
          append(`${first ? '' : ',\n'}${wrapped.slice(10, -1)}`);
          first = false;
        }
      }
    } else if (data.checkpoint) {
      self.postMessage({ ready: true });
    } else if (data.end) {
      if (!ndjson) append('\n]}\n');
      flush();
      self.postMessage({ blob: new Blob(parts, { type: mime }) });
    }
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};

import { stringifyRedacted } from './path-privacy.js';

const README = {
  schema: 'Version 1. JSON has readme, run, and results. Gzip-compressed NDJSON starts with a line that has type=run, readme, and run. Subsequent lines have type=result and result.',
  run: 'scanner_git_commit is the build revision, scanner_version is the Cargo version, scanner_working_tree_dirty describes tracked build inputs, and wasm_sha256 identifies the browser Wasm bytes. profile and scheduling_mode identify the initial policy; scheduling_modes records every applied policy label. user_agent, platform, hardware_concurrency and device_memory_gib are browser-reported. started_at is UTC. method names the picker or drop API. folder_name is the selected root label. files_seen, directories_seen and skipped_entries count entries exposed by the source. skip_examples contains up to 64 affected paths with a truncation flag. symlink_metadata_available says whether link identity and targets can be inspected. app_bundles is the number of discovered bundles. enumeration_ms covers discovery. scan_ms runs from the first worker start to the last result; it can overlap discovery. Throughput is completed rows or bytes per second over scan_ms. peak_worker_count counts concurrent active scans. long_tasks contains up to 256 recent main-thread task offsets and durations in ms where supported. An overlapping native task can have a negative offset. canceled indicates interrupted discovery. partial indicates a discovery or evidence limit. recovery_state is the last saved state when a scan is exported after reopening the page.',
  identity: 'id identifies a row in this document. stable_id combines input kind and display path for comparisons across runs. display_path begins at the selected folder name. parent_bundle_path identifies the nearest enclosing app. bundle_role describes app, nested_app, wrapper or resource_only. source names the scanner transport.',
  outcome: 'status is the scan outcome and error/error_class describe the failure. format is the detected container. architectures lists slice names, cpu_type, cpu_subtype, offsets and sizes in bytes, header_verified, per-slice minimum macOS and code-signature load-command presence. A signature may be present without being validated. bundle_path, bundle_id, version, name and min_macos describe app metadata. installer, inventory, script_runtime and metadata source/resolution fields may be supplied by the scanner.',
  evidence: 'info_plist is the complete parsed property list when available. Non-JSON plist values are tagged with $plist and value. info_plist_keys are the top-level keys. info_plist_path, info_plist_size and info_plist_encoding describe the source. plist_in_container identifies member-relative paths in an archive. executable_name is CFBundleExecutable; executable_path and executable_size describe its resolution. executable_prefix_hex is up to 64 source bytes. load_commands lists per-slice command ids, sizes and interpreted key fields. directory_listings has Contents and MacOS entries with name, type, size, symlink_target and a truncated marker. candidate_executables and nested_artifacts include paths observed by discovery or the format scanner.',
  reads: 'read_log records up to 1,024 attempted reads in order, with the source path, offset, length, purpose and outcome. A logical range split by the browser includes source_chunk entries for physical subranges. bytes_read is the scanner’s successful source coverage, bytes_requested is attempted coverage, decoded_bytes is decoder work, reads counts requests, total_size describes the scanned source, and elapsed_ms measures the row between worker start and completion. Diagnostic-only reads are identifiable in read_log.',
  reproduction: 'Failures supply a relative_path, copy_from_selection, container_member_paths, supporting_paths for other observed candidates or nested artifacts, missing_executable indicator, expected_executable_path when known, expected_status and native CLI command. Use scripts/diagnostics-to-fixtures.mjs to make a skeleton. Copy the listed original files for exact reproduction when metadata and the executable prefix are insufficient.',
  privacy: 'This is generated locally. Usernames in macOS, Linux and Windows home paths are always redacted. The only source payloads are parsed Info.plist values and the executable prefix. The browser omits inode and symlink information that the selected API does not expose. Unavailable fields can be null or omitted. Successful rows also omit repeated fields. diagnostics_truncated indicates that this row reached the saved evidence budget.',
};

const encoder = new TextEncoder();
const parts = [];
let writer;
let output;
let plainLimit;
let count = 0;
let chunk = '';
let pending = Promise.resolve();
let failed = false;

function append(value) {
  chunk += value;
  if (chunk.length >= 128 * 1024) return flush();
}

function flush() {
  if (!chunk) return;
  const bytes = encoder.encode(chunk);
  chunk = '';
  if (writer) return writer.write(bytes);
  parts.push(bytes);
}

async function handle(data) {
  if (data.header) {
    plainLimit = data.plainLimit;
    if (data.format === 'ndjson.gz') {
      const gzip = new CompressionStream('gzip');
      writer = gzip.writable.getWriter();
      output = new Response(gzip.readable, { headers: { 'Content-Type': 'application/gzip' } }).blob();
      void output.catch(() => {});
    }
    const header = stringifyRedacted({ ...(writer ? { type: 'run' } : {}), readme: README, run: data.header });
    await append(writer ? `${header}\n` : `${header.slice(0, -1)},"results":[\n`);
  } else if (data.records) {
    for (const result of data.records) {
      count += 1;
      if (!writer && count >= plainLimit) throw new RangeError('Plain JSON is limited to fewer than 5,000 rows.');
      const line = writer ? `${stringifyRedacted({ type: 'result', result })}\n` :
        `${count === 1 ? '' : ',\n'}${stringifyRedacted(result)}`;
      const written = append(line);
      if (written) await written;
    }
  } else if (data.checkpoint) {
    self.postMessage({ ready: true });
  } else if (data.end) {
    if (!writer) append('\n]}\n');
    await flush();
    if (writer) await writer.close();
    self.postMessage({ blob: writer ? await output : new Blob(parts, { type: 'application/json' }) });
  }
}

self.onmessage = ({ data }) => {
  pending = pending.then(() => {
    if (!failed) return handle(data);
  }).catch((error) => {
    failed = true;
    self.postMessage({ error: error.message });
  });
};

# WASM size work checkpoint

Worktree `scanner-wasmsize`, base `scanner-pages` at `12b3b2c`.

- Deadline 00:52 Central on November 25, assuming the 23:12 start on November 24. Use one Cargo build at a time with `-j2`. Keep work local. Browser checks require a separate run under authorization to launch Chromium.
- Environment for commands from `scanner/`:

  ```sh
  export PATH=$HOME/.cargo/bin:$HOME/.local/share/mise/installs/node/latest/bin:$PATH
  export WASM_BINDGEN=$HOME/Code/doesitarm-scanner/scanner/target/tools/bin/wasm-bindgen
  ```

- Baseline captures, timing, and experiment files live under `target/wasm-size/`. The normalized log is `baseline.ndjson`, the manifest is `cases.json`, and `baseline/replay.log` records per-app acquisition.
- The serial capture consumes pinned HTTP range responses and writes temporary range transcripts for offline comparison. Delete those transcripts after the last comparison. The reports and canonical JSON logs can stay for resuming.
- After the baseline finishes, replay the unchanged package into an offline timing reference. Compare following packages with `target/wasm-size/compare.py` under the same reader, budget, and response bytes.
- Start from the unmodified symbol data and check each change independently. Keep the native CLI at the standard release profile. A candidate with changed results or a different read schedule needs investigation before it can go into a commit.

- Step 1 verified the original SHA-256 and completed all 909 normalized comparisons with zero differences. The next checkpoint applies the selected Wasm-only Cargo profile and strips shipped names.

- Step 2 selected opt-level z, fat LTO, one codegen unit, and panic abort. The shipped browser package is 6,633,612 B raw, 961,908 B gzip, and 611,119 B Brotli, with zero real-app or fixture differences. The raw-size target still needs reader erasure.

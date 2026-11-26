# WASM size checkpoint

Worktree `scanner-wasmsize`, based on `scanner-pages` at `12b3b2c`. The November 24–25 run finished before the 00:52 Central cutoff. All changes are local commits.

- The baseline reproduced 24,493,375 raw bytes and the original SHA-256. The breakdown is in [WASM-SIZE.md](WASM-SIZE.md) and the first checkpoint commit.
- The build tuning checkpoint shipped 6,633,612 B raw, 961,908 B gzip, and 611,119 B Brotli. Named copies were moved to `target/wasm-symbols/`.
- The final build uses reader erasure and opt-level 3. It ships 1,959,784 B raw, 667,433 B gzip, and 477,706 B Brotli. Its offline app replay took 173.56 s against 166.46 s for the original. All 909 canonical cases and 125 native folder results matched. The browser and Worker hashes matched across two builds.

## Resuming

- `target/wasm-size/cases.json` is the fixed case manifest. `baseline.ndjson` and `step3.ndjson` contain canonical outputs with timing stored alongside them. Test logs, the profile trials, and the comparison scripts are in the same directory.
- Temporary HTTP range captures were deleted after verification. Reacquire responses to repeat the full app replay. The fixture and ledger kit inputs are still available.
- Build with one Cargo job group at a time and `-j2`. From `scanner/`, use the installed tools and the normal packaging script.

  ```sh
  export PATH=$HOME/.cargo/bin:$HOME/.local/share/mise/installs/node/latest/bin:$PATH
  export WASM_BINDGEN=$HOME/Code/doesitarm-scanner/scanner/target/tools/bin/wasm-bindgen
  node web/scripts/build.mjs
  ```

- Chromium regression, smoke, and element-count checks were excluded by the no-browser instruction. Workspace Clippy surfaced 12 diagnostics in the untouched page resolver. Clippy passed for `scan-core`.

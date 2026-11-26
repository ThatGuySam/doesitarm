# Scanner shims work log

- Started from `scanner-pages` at `12b3b2c` in `~/Code/doesitarm-scanner-shims`.
- Read EDGE, the ledger and all three fixer reports. Reuse the ledger's exact recorder, sparse replay and Warp cassette. Reuse the EDGE and container generators for cases whose raw compressed payloads would be large or non-redistributable. [Research and inventory](SHIMS.md)
- The sandbox could not start before the requested worktree mount point existed. Created the directory and worktree with the Git write approval path. Integrated ledger changes by preserving both the page resolver and ledger CLI entry points and dependencies.
- The ledger merge passed 77 existing Rust tests with `cargo test --offline -j2 --workspace`.
- Implemented compressed trace framing, strict replay, result-preserving reduction, Rust emission and ledger add. A compile check covered the first version. A release build and CLI smoke verification are in progress.
- Exercised generated inputs through the pre-EDGE, pre-container-fix and fixed binaries. The first checks reproduced the Soothe2 missing plist, RStudio unsupported compression, XZ dictionary failures and ZIP trailer failures. Aqua, Insta360 and MPP exercise budget exhaustion and a higher-tier success on the same structural input.

# Fix tail: runaway read counts and the batch tail

Branch `scanner-fix-tail` (from `scanner-ux2` 8ffbae7). Preview Worker `doesitarm-scanner-preview`, version `0bd1118f-424d-4e9f-9aeb-367a4df38b37`.
Evidence: Sam's recording, `doesitarm-data/ui-video/FINDINGS.md`.

## The shared cause

The UI's "read" figure was the sum of every physical `file.slice` read. The core's own `bytes_read` is unique coverage and can never exceed the file. When the scanner decoded the same compressed data again and again, each repeat re-read the packed bytes and the UI added them again. That is how a 123 MB file shows 32 GB, and why Antigravity looked as if it read the whole file.

## 1. The 123 MB ZIP showing 32.2 GB (bf0780f6...zip)

Candidates tested with generated fixtures under 2 MB (`fixtures/tail_fixture.py`, outputs in `fixtures/tail/`):

| Candidate | Fixture | Local result before |
|---|---|---|
| deflated disk image inside a ZIP, read back to front | `deflated-dmg.zip` (50 KB, 48 MiB logical image) | **requested 4.0x the file, decoded 201 MB**. Reproduces the class. |
| 1.5 GiB zero-filled executable entry | `zeros-executable.zip` | stops after the header, 65 KB read |
| 2000 entries | `many-entries.zip` | 150 KB read, terminates |
| nested ZIP in ZIP, cycles | not buildable | the scanner has no ZIP-in-ZIP nesting kind, so there is nothing to recurse |

Cause: `SeekableMember` (zip.rs) restarted the compressed member from its first byte on every backward jump of the inner disk-image parser. Each restart re-reads and re-inflates the packed bytes. A real image with a few hundred backward jumps gives about 260x the file, which matches the recording. I could not confirm this is what the real file contains, because the file is not here. The fix is generic, so it covers it if so. **Please send the file (it is in Sam's Downloads on the Mac) so we can confirm.**

Fix:
- The first backward jump decodes the member once into memory (up to 768 MiB) and answers every later read from that copy. Larger members end with `could not finish: nested disk image in a compressed ZIP entry is too large to read out of order; extract it first`.
- Any `Forward` compressed stream stops with a clear limit message after 64 restarts (also covers xar scripts and 7z blocks).
- The browser counts unique bytes touched (`coverage.js`), so the displayed figure cannot exceed the file. The core also reports `bytes_requested` and `decoded_bytes` separately in Details.
- Result after, same fixture: requested 2.0x (one pass to the trailer, one to hold), bytes shown 50.6 kB = file size (was 202 kB).

## 2. Antigravity.dmg

Sam's exact 193 MB file is not on the vendor pages now (current: 2.36.0 arm 241.6 MB, x64 251.7 MB; Antigravity IDE 2.8/2.9 arm 174 MB, x64 180 MB). The IDE 2.9.0 x64 DMG (180,443,074 bytes, official `edgedl.me.gvt1.com` URL in the Homebrew cask `antigravity-ide`) reproduces the recording. The 2.35.2 arm DMG (242 MB) was fine (26 MB read, 0.35 s), so the problem is layout dependent.

Cause: an APFS volume walk revisits more compressed 1 MB chunks than the 2-entry decoded-chunk cache in `dmg.rs` holds. Each miss re-reads the packed chunk and decodes it again.

| IDE 2.9.0 x64 DMG, local profile | before | after |
|---|---|---|
| time (native) | 59.7 s | 6.6 s |
| source bytes requested | 463.9 MB (2.6x the file) | 59.2 MB |
| decoded | 4.55 GB | 304 MB |
| reads | 4393 | 295 |
| unique bytes read | 59.1 MB | 59.1 MB |
| browser (headless Chromium, same file) | 85.6 s, UI "464 MB read" (growing 34, 61, 91, 120, 140, 153 MB, as in the recording) | 10.1 s, UI "59.1 MB read" |

The verdict JSON is identical before and after apart from the three counters (x86_64, 30 inventory binaries).

Fix: a local scan keeps decoded chunks in an LRU of up to 256 MiB (the worker profile keeps two as before). Unit test `revisited_chunks_are_fetched_and_decoded_once` (red at 10x, green at 1x).

What still reads 59 MB (33%): the bundle inventory checks the header of all 30 binaries, and each sits in a different compressed chunk of 0.3-1 MB. That is the inventory feature (it finds Intel-only helpers), not a missed early exit. I did not cut it. If a smaller read matters more than the inventory for DMGs, that is a product choice.

Shim tooling: the capture needs 59 MB of real compressed chunks, so a replay under 2 MB is not possible. The test above is synthetic instead.

## 3. The batch tail

- After 15 s a running row says "Still working" (it has Cancel, as before).
- When nothing is queued and every running scan is past 15 s, the count line reads "79 of 81 finished · 2 still scanning" and the button reads "Cancel 2 still scanning". It cancels only unfinished scans. Finished results stay (checked in `test/tail.browser.test.mjs`). Nothing is stopped by the timer; it only changes the wording.
- Pure logic: `public/tail-state.js`, tests in `test/tail-state.test.mjs`.

## Gates

- `cargo test --workspace`: green (new: `scan-core/tests/tail.rs` 3, `dmg` unit test 1).
- Real-app gate: all 82 fixture scans (scan-cli, local profile) byte-identical before and after. Antigravity IDE 2.9.0 x64 identical apart from the counters. The recorded `casks.jsonl` results cannot be replayed here (the original files are not stored).
- native-vs-wasm: 501 comparisons agree.
- `npm test` 76 pass plus `test:browser` 20 pass (new 2 tests; `browser.test.mjs` now starts in the Research view, because Minimal hides the details those 5 subtests read; they also failed on `scanner-ux2` before). `test:a11y` pass, `test:ui` 10 pass at load 1.2 (one expectation moved from 1,048,612 to 1,048,608 because the progress total now counts unique bytes), element counts unchanged.

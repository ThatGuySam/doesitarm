# Fix tail notes

Branch `scanner-fix-tail` from `scanner-ux2` (8ffbae7). Started 2026-11-27 13:27 local.

## Anomaly 1: 32.2 GB read of a 123 MB ZIP
- The browser counter adds every physical `file.slice` read, so repeated reads count again. The core's own `bytes_read` is unique coverage and cannot exceed the file.
- Reproduced class: `fixtures/tail/deflated-dmg.zip` (50 KB, a deflated disk image of 48 MiB zeros plus the hfsx fixture). Local scan requested 202,112 bytes of a 50,629 byte file (4x) and decoded 201 MB. Cause: `SeekableMember` in `zip.rs` restarted the compressed member from its start on every backward jump of the nested DMG parser (`Forward::rewind_for`), re-reading and re-inflating the packed bytes each time.
- Not the cause (tested, fine): 1.5 GiB zero executable entry (`zeros-executable.zip`), 2000-entry ZIP (`many-entries.zip`).
- Fix: first backward jump decodes the member once into memory (cap 768 MiB, else a clear Limit status); `Forward` stops after 64 replays with a clear status.

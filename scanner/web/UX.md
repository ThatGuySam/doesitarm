# Scanner UX refinement

November 24, 2026. Branch `scanner-ui`, worktree `~/Code/doesitarm-scanner-ui`, all changes under `scanner/web/`. Inputs were the UX research notes (`notes-search/docs/research/macho-wasm-scanner-2026-11-23-team/seats/ux-research/notes.md`), the original `pages/apple-silicon-app-test.vue` and the live page at doesitarm.com. The scheduling, progress, timer, batch bar and cancellation behaviour from `UI.md` is unchanged, and its tests still pass.

## Element counts

`npm run count` runs `scripts/count-elements.mjs` in headless Chromium on loopback. It counts the original from a scripts-free snapshot in `test/fixtures/original-app-test/`, using the original's `.app-main` element as the root. The original's result rows are rebuilt from the Vue template, with the `.shimmer` class on unfinished rows. Ours is counted with `main` as the root, during a real scan. The research spec's rules apply.

- One element per text run, named control, progress bar, image or loader.
- Row dividers count; frames and table gridlines do not.
- Nothing is counted inside a closed `<details>` or `<dialog>`, nothing clipped or visually hidden, and no transparent text.
- Inline emoji and inline badges belong to their line.

The mid-scan fixture is six files: 2 finished, 1 scanning and 3 queued. Ours uses 1 worker for this; reads of the last four files are slowed by `scripts/ux-delay-worker.js`. Counts use 1440 × 900 and 390 × 844 viewports with no hover and no focus.

| Width | State | Original | Target ±10% | Before (prototype) | Ours |
|---|---|---:|---|---:|---:|
| 1440 | idle | 11 | 10–12 | 299 | 11 |
| 1440 | mid-scan (6 files) | 31 | 28–34 | 347 | 32 |
| 1440 | done (6 files) | 47 | 43–51 | 362 | 43 |
| 390 | idle | 11 | 10–12 | 299 | 11 |
| 390 | mid-scan (6 files) | 29 | 27–31 | 341 | 30 |
| 390 | done (6 files) | 41 | 37–45 | 356 | 37 |

The original counts reproduce the research's predictions (11, 31/29, 47/41). "Before" is the prototype at `1c0c8d9`, measured with the same script and fixture (`SCANNER_PUBLIC=<old public> node scripts/count-elements.mjs --counts-only`). The Homebrew table held about 280 of those elements. `node scripts/count-elements.mjs --ledger` prints every counted element.

Caveat: a queued row's Cancel button stays invisible until hover or keyboard focus, so it is not counted at rest. On touch screens (`hover: none`) it is always visible. That adds 3 elements to the phone mid-scan count on a real phone: 33 against the 27–31 target. I kept a visible cancel on touch screens rather than hit the number.

### Element budget per row

| Row state | Elements | Contents |
|---|---|---|
| Queued | 1 + divider | `Name — size · Queued`; Cancel appears on hover or focus |
| Scanning | 2 + progress strip | `Name — size · Scanning · 12 kB read · Elapsed 0:05 · About 0:03 left`, and Cancel. The progress strip takes the place of the row divider. |
| Finished | 4 desktop, 3 phone, + divider | Monogram (768 px and up, as in the original); `Name — size · time`; verdict line with arch badges; `Details` disclosure |

## What changed

- **Look:** tokens copied from doesitarm.com's Tailwind build. There is no import or hot-link.
  - Surfaces: `#34393f → #191a1d` gradient (to bottom left), with `#121416` for buttons.
  - Text: gray-300, gray-400 muted, gray-700 dividers, `#ffa766` accent.
  - Size and layout: 20 px root, a centred 1040 px column with 1.5 rem insets, and the neumorphic shadow on a large rounded Select Apps button.
  - Rows: the framed, divided result list with a darker→dark gradient and a 2.4 rem initial circle at 768 px and up.
  - Navbar: the 🦾 home mark and emoji + label links.
  - Font: the live CSS asks for `Inter`, but it only declares `InterVariable`, so visitors get the system font (San Francisco on Macs). I copied the same stack and did not self-host Inter.
- **Wording:** the title and **Select Apps** stay. The research copy supplied the subtitle ("Check whether your Mac apps run natively on Apple silicon."), the helper line, "How it works", the verdicts, "Request a review" (now in the dialog) and the "Public HTTPS download URL" label. The research copy is used where the original's wording is out of date ("Extract DMGs and PKGs first").
- **Surface at rest:** 11 elements.
  - Title, subtitle, Select Apps, one helper line (formats and local privacy), Choose folder.
  - The `Advanced` and `How it works` disclosures.
  - `Recorded Homebrew run · 30 casks · date`.
  - Three FAQ disclosures. The original's five questions are merged: what results mean, why a check fails or hangs, and Rosetta.
- **Progressive disclosure.** Nothing from the prototype was removed.
  - **Row `Details`** (native `<details>`): the per-row speed sentence, plus architectures, bundle ID, app version, min macOS, signing, format, source, bytes read, status and the error text. Signing comes from each slice's `code_signature_present`.
  - **`View full scan details`** opens one shared native `<dialog>` titled "Scan details for X".
    - Facts: verdict, status, source and format, full size, wall time, speed, bytes read and reads, bytes requested, bytes decoded, executable, architectures, min macOS and any error.
    - Below the facts: `Request a review` and a `Raw JSON` disclosure.
    - It opens with `showModal()`, so the background is inert and Tab is contained. Esc and Close both work, and focus returns to the trigger.
  - **`Advanced`**: the URL form and the Gentle mode toggle with its live mode line. This branch has no byte-budget control: per `UI.md`, browser scans use the `local` profile with no budget. So Advanced holds the URL form and Gentle instead.
  - **`Recorded Homebrew run`**: the full 30-cask table, date and description. Its summary line carries the count and date.
- **Naming the disclosures:** the brief asked for a "Details" button that opens the dialog. The research gives "Details" to the row disclosure, as in the original, and "View full scan details" to the dialog. I followed the research, and put the dialog button inside the disclosure so the row stays at the original's density.
- **Clear results:** shows only when nothing is pending. It empties the list, hides the results area and returns focus to Select Apps. Earlier batches used to pile up with no way to reset.

## Totals line

The batch count and totals form one sentence, which is also the results `<h2>` (the focus target after Cancel all or a Homebrew rescan):

- While running: **2 of 6 finished · 1 scanning · 3 queued** · 2.02 GB scanned at 2.1 GB/s, reading only 248 B (<0.0001%) · Elapsed 0:01 · About 0:03 left
- Done: **6 of 6 finished** · 19.7 GB scanned in 17 s at 1.11 GB/s, reading only 744 B (<0.0001%)
- Per row, in Details: "Scanned 2.1 GB in 5.6 s (374 MB/s), reading only 172 B (<0.0001%)". The row line itself shows `— 2.1 GB · 5.6 s`.

Definitions, in `public/scan-totals.js` (pure, tested in `test/totals.test.mjs`):

- **Scanned:** the full size of each checked artifact, not the bytes read.
  - Files: the file size. Picked folders: the sum of the bundle's files in the picker.
  - URLs: `total_size` from the browser or Worker range response, i.e. Content-Length.
  - Dropped bundles: no size. Their `total_size` is only plist plus executable, so it is never used as the app size.
- **Which jobs count:** only `complete` scans enter the size, the rate and the read figure. Errors, limits and unsupported files are excluded and reported as "N not checked". Canceled jobs are excluded and shown in the count.
- **Speed:** scanned size divided by batch wall time, measured with `performance.now()` from the first accepted job to the last terminal event. That includes queueing and Cloudflare fallback; per-job durations are never summed.
  - The rate shows GB/s at or above 1 GB/s, otherwise MB/s (kB/s below that).
  - If any checked job lacks a size, the line becomes "X GB scanned across 2 of 3 with known sizes" with no rate and no percentage, so a partial size set never understates the speed.
  - If no checked job has a size: "120 checked in 1.6 s, sizes unknown, reading 69.1 kB". This is the 120-app folder drop in the smoke test.
- **Reading only N (P%):** bytes the row readout counted, i.e. completed source reads including rereads, plus the Worker-reported bytes for a Cloudflare fallback. P is that figure over the scanned size for the same jobs, to two significant figures, with a `<0.0001%` floor. The JSON keeps the core's unique `bytes_read` and `bytes_requested`.
- **Units:** decimal GB/MB/kB (10⁹/10⁶/10³), as the research recommends and as Finder shows sizes. Binary MiB stays only in the Worker's budget tiers. Values carry three significant figures below 100, then whole numbers: 620 MB, 1.4 GB, 19.7 GB, 312 GB. Times show `<0.1 s`, `6.1 s`, `42 s`, then `2:05`. Each number is joined to its unit by a no-break space, so lines never break between them.
- **Live updates:** the count changes as soon as a job settles. The totals part updates at most once a second, and the live rate is rounded to two significant figures, so the text does not jitter. `#results-count` is no longer a live region. `#batch-notice` (`role=status`, visually hidden) announces three things:
  - "Scanning N items." at the start of a batch;
  - the count, at most every 10 s, only when it has changed;
  - one completion sentence: "Finished 6 of 6. 19.7 GB scanned in 17 s at 1.11 GB/s, reading only 744 B (<0.0001%)."

## Other UX refinements

- **Empty state:** no results area until a job is accepted. The helper line says what to drop and that local files stay in the browser.
- **Drag target:** dragging files anywhere over the page outlines the drop zone and shows "Drop to scan". Over the zone, the outline turns solid gold. If a drop yields no files, the message explains: "Some browsers, including Firefox, do not expose dropped folders. Use Choose folder instead." `How it works` says the same.
- **Verdicts with non-colour cues:**
  - `✓ Apple Silicon native` or `✓ Apple Silicon native (Universal)`, from verified header slices;
  - `◆ Intel only · may run with Rosetta`;
  - `? Unknown — read limit reached`, or another reason;
  - `? Other architecture · not verified for Apple silicon`.
  - Colour (green, gold, gray) is a second cue only.
- **Keyboard:** the tab order is skip link, home, nav, Select Apps, Choose folder, Advanced, How it works, Homebrew, then the FAQ. Disclosures work with Enter and Space. A queued row's Cancel appears when focused. Focus moves to the row heading when its Cancel finishes the row. The dialog traps focus and returns it on close.
- **Phone (390 px and 320 px):** a single column with no horizontal overflow, the Select Apps button fitted within the viewport (the original overflows at 390 px), facts in two columns, and the Homebrew table scrolling inside its focusable region.
- **Reduced motion:** no shimmer and no stripe animation; the progress strip and "Scanning" text stay static.
- **Contrast** (WCAG, computed in `scripts/a11y-check.mjs`):

  | Token | On #34393f | On #191a1d |
  |---|---:|---:|
  | Text gray-300 | 7.9 | 11.8 |
  | Muted gray-400 | 4.59 | 6.85 |
  | Gold | 6.08 | 9.09 |
  | Green | 8.29 | 12.4 |
  | Red | 6.14 | 9.17 |
  | Control and input boundary `#808897` | 3.26 | 5.18 |

  Gray-700 is used for decorative dividers only.
- **Focus and targets:** a 3 px gold outline with offset. Buttons are at least 44 px high; summaries and the text button are at least 32 px.

## Verification

Run these from `scanner/web` with the same PATH as `UI.md`. The build also needs `WASM_BINDGEN=$HOME/Code/doesitarm-scanner/scanner/target/tools/bin/wasm-bindgen`.

| Command | Result (2026-11-24) |
|---|---|
| `npm test` | 30/30. Includes 7 new totals and formatting tests. |
| `npm run test:ui` (source smoke, 9 cases) | All pass. Assertions updated for the new structure: JSON is read through the dialog, Gentle sits under Advanced, and finished rows hide their progress strip. |
| `npm run build && npm run test:browser` (built page, 5 cases) | All pass. The URL form is reached through Advanced and the Homebrew table through its disclosure. |
| `npm run test:a11y` | 18 checks pass: tab order, focus ring, Enter/Space on disclosures, names, ≥24 px targets, polite announcements, dialog name/focus/trap/Esc/return, reduced motion, Clear results focus, and no overflow at 390 and 320 px. |
| `npm run count` | Table above. |
| `npm run screenshots` | `screenshots/*.png`. Reduced to a 96-colour palette with `magick … PNG8:`; 412 KB total. |

The screenshots show the original idle state, then ours idle, mid-scan, done (one row's Details open) and with the dialog open, at desktop and phone widths.

## Not done or not verified

- No real screen reader, Firefox or Safari run. The a11y checks are scripted Chromium checks, and the announcements are verified as text only.
- Rows have no "Retry" for failed checks. Re-selecting the file is the path.
- The "Request a review" link searches GitHub issues by bundle name or label, as in the original.
- The original's mid-scan rows are reconstructed from the Vue template, not captured from a live hydrated scan, because the snapshot has its scripts removed.
- The touch-screen caveat on the queued Cancel above.

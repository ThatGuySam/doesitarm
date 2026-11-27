# App name collisions

Read this before adding or renaming an entry in `README.md`. A README name
decides two things: the listing URL, and which scanned apps the entry absorbs.
A careless name can make another app's page disappear.

## How matching works

The build compares every README entry with every scanned app
([`helpers/build-app-list.js`](../helpers/build-app-list.js), using
`findReadmeMatchAlias` in
[`helpers/readme-scan-match.js`](../helpers/readme-scan-match.js)). A scan has
aliases (its display name first, then names such as the executable, and last a
name built from the bundle ID, for example `Apple Terminal`) and a bundle ID.

Step 1, name match (`eitherMatches` in
[`helpers/matching.js`](../helpers/matching.js)):

- Case is ignored. Blank aliases never match.
- Same length: the two strings must be equal.
- Different length: the shorter string must appear as whole words inside the
  longer one. Punctuation counts as a word break, so `Yandex` matches
  `Yandex.Disk.2`. A name that starts with punctuation must not follow a
  letter, so `.NET` does not match `Battle.net`. Letters outside ASCII count as
  letters: `QQ` does not match `QQ音乐`, and `Pok` does not match `Pokémon`.
- It works in both directions: a short README name inside a longer scan alias,
  or a scan alias inside a longer README name. A name in parentheses counts as
  an exact alternative (`X Lossless Decoder (XLD)` equals `XLD`).

Step 2, vendor checks. The scan's vendor is the bundle ID segment after the
domain part (`com.xk72.Charles` gives `xk72`). Any two-letter first segment is
a country code. After the top level, second-level parts (`co`, `com`, `id`,
`gob`, …) and generic domain words (`app`, `design`, `download`) are skipped
too, but never the last segment: `se.propellerheads.reason` gives
`propellerheads`, `kr.co.vcnc.x` gives `vcnc`, `au.id.x.y` gives `x`, and
`com.design.spline` gives `spline`. The vendor *agrees* when it appears in
the README name or in the README link's host (`adobe.com`). Hosts such as
`apps.apple.com`, `github.com` and `sourceforge.net` say nothing about the
vendor and are ignored. Then:

- **Exact match.** The scan's display name always counts. Any other alias (an
  executable name such as `firefox` in Tor Browser) counts only if the vendor
  agrees or the README name appears in the bundle ID.
- **Bundle IDs without a vendor never match partially.** `com.electron.*` and
  `com.github.electron.*` are Electron's and electron-builder's default IDs:
  real apps ship with them (Zettlr) and so do repackaged ones (a nativefier
  Discord), and the ID never names the vendor. `com.apple.automator.*`
  (Automator stubs), `com.fluidapp.*`, `com.parallels.winapp.*` and
  `com.codeweavers.crossoverhelper.*` wrap another app. An exact display-name
  match still counts, so a README entry named `WhatsApp Desktop` would take a
  `com.electron.whatsapp` scan with that name, but `WhatsApp` would not.
- **A secondary alias that is just the vendor word** (`Yandex` on Yandex Disk,
  `Maxon` on Maxon App) never matches partially.
- **README name inside a longer scan alias.** Counts if the vendor agrees, or
  if the alias is the scan's display name and starts with the README name
  (`Discord` takes `Discord PTB`; `kitty` does not take `Hello Kitty`; `Steam`
  does not take a scan whose bundle-ID alias ends in `Steam`). It also counts
  when the alias is exactly the scan's vendor plus the README name and the
  README link names no vendor (`Pro Tools` with an App Store link takes `Avid
  Pro Tools` from `com.avid.ProTools`). A vendor link that disagrees wins:
  Lemkesoft's `FontBook` does not take `Apple FontBook`. `Things` takes
  `Things 3` but not `Things3`, which is not a separate word.
- **Scan alias inside a longer README name, with words in front.** The words
  in front usually name a vendor, so the scan must carry them in its bundle ID
  or aliases (`Spectrasonics Keyscape` takes `com.spectrasonics.*`; `Warp
  Terminal` does not take Apple's `Terminal`). A scan whose bundle ID has no
  vendor may carry them in its download host instead: the words, or the words
  joined together (four letters or more) as the start of the host's first
  label. `Angry IP Scanner` does not take the `IP Scanner` scan that downloads
  from `10base-t.com`, would take one from `angryip.org`, and `Mac Fan
  Control` does not take a scan from `macupdate.com`. A scan with neither a
  vendor nor a download link gives no evidence and is kept (`Autokroma
  Influx`, bundle ID `TODO`).
  Old vendor names count for their successor (`redgiant` for Maxon); the list
  only holds cases seen in the feed.
- **README name = scan alias + qualifier** (`Arduino IDE`, `Timing for Mac`):
  the scan's display name counts. A secondary alias counts only if the vendor
  agrees or the alias is the product part of the bundle ID (`Rhinoceros` in
  `com.mcneel.rhinoceros.7`; not `Electron` or `Focus`).

The data cannot tell some pairs apart, for example `Session for Mac` (a timer)
and the Session messenger. Those are listed in `SEPARATE_PRODUCTS` in the same
file, keyed by README name and bundle ID (plus the start of the scan's display
name where the bundle ID is shared, as with Testlum and IntelliJ Community). A
test fails when a key is no longer a README entry, so rename the key with the
entry.

Step 3, best entry. When several README entries accept a scan, it goes to:
an exact name match first (the full name before a name without its
parenthesised part), judged on the best alias the entry accepts, not the
first one; then the entry with the most of its words in the scan's
aliases and bundle ID (`Lightroom Classic` over `Lightroom` for Adobe
Lightroom Classic, `Acrobat Pro` over `Acrobat Reader`); then the entry with
the fewest words the scan lacks; then the first in the file.

A matching scan is merged into that entry: its bundle IDs, aliases and links
move over, and the scan's own listing and URL are removed.

Scans are keyed by slug, so two scans with the same display name share one
listing and the other scan is dropped. The later scan in the feed keeps the
slug, unless the earlier one has a clearly stronger claim to the name
(`laterScanTakesSlug`, using `getSlugClaimStrength`). Claim levels, weakest
first:

0. Wrapper and default bundle IDs, Chrome web-app stubs
   (`com.google.Chrome.app.*`), template placeholders (`com.yourcompany.*`,
   `*.identifier`) and dotted IDs with no vendor. Any real claim beats these:
   the nativefier `Discord`, the Parallels `Wireshark` and Chrome's
   `Instagram` stub never take a slug from a real app. Chrome stubs that keep
   their own slug still merge into `Chrome`.
1. A vendor that matches neither the name nor appears with it in the ID
   (`pt.vodafone.webapp` for `nwjs`).
2. The name appears in the bundle ID (`org.niltsh.MPlayerX`), or a dotless ID
   equals the name (`IPScanner` for `IP Scanner`).
3. The vendor is the name or one of its words (`com.instagram`,
   `tv.plex.desktop`), compared as whole words.

A claim two or more levels stronger keeps the slug (`io.nwjs.nwjs` over the
Vodafone app). Claims one level apart keep feed order, except that a scan
with no version does not replace one with a version (`tv.plex.desktop` keeps
`/app/plex` over `sddda.Plex`). Feed order is kept on purpose so existing pages
do not switch scans on a weak signal (qView, Self-Service, PDF Toolkit, VK
Messenger). It also means a page can show an older version of the same app
when the older scan comes later in the feed.

Two different products with the same name (Apple's and Universal Audio's
`Console`, Cycling '74's and sbooth's `Max`) still share one listing; only one
of them is shown.

The listing URL comes from the README name through `makeSlug`
([`helpers/slug.js`](../helpers/slug.js)): `Yandex Browser` becomes
`/app/yandex-browser`.

## Check a name before using it

```sh
bun scripts/check-name-collisions.mjs "Yandex Browser=https://browser.yandex.com" "Notion Calendar"
```

Add the README link after `=` when you have it; the vendor checks use its
host. Without a link the entry is checked as if its link named no vendor, the
same as an App Store or GitHub link. The script runs the real build
(`buildReadmeAppList`) on the checked-out
`README.md` and the scans feed (`SCANS_SOURCE`, or the public feed), once as
is and once with the new names added at the end of the list. For each name it
prints the scans the entry absorbs and, for each, whether it is taken from
another README entry or its own listing goes away. Below that it lists scans
whose names match but that stay elsewhere, and where they go. Exit code 2
means the entry absorbs more than one scan or takes one from another listing.
It needs bun because the build helpers use the `~/` import alias.

- One match, the intended app: use the name.
- Several matches, all the same product (installer, updater, uninstaller,
  beta, or versioned copies such as `Wondershare UniConverter 13`): the name is
  fine. Absorbing them is the intended result.
- Any match that is a different product: rename, using the rules below.

## Naming rules, in order

1. **Keep the scan's listing name when it is collision-free.** The URL stays
   the same and nothing else moves.
2. **Put the company name before the app name.** This is the usual fix and the
   README already does it throughout: `Maxon Looks`, `AJA Control Room`,
   `Microsoft Remote Desktop`, `MOTU Discovery`, `Elgato Stream Deck`. Use the
   name the vendor uses. Scans usually carry a vendor-plus-product alias taken
   from the bundle ID (for example `Objective-see Oversight`); a README name
   that equals such an alias matches that scan and not its neighbors.
3. **Add the qualifier the vendor uses** when the company name is not enough
   or reads wrong: platform (`Sip for Mac`, `LINE for macOS`), form
   (`GitHub Desktop`, `Notion Desktop`), edition (`Simple Comic (Community
   Fork)`), or a clarifying alias in parentheses (`Go (golang)`, `Robo 3T
   (formerly Robomongo)`).
4. **Never list an app under a bare generic word.** Names such as `Ray`,
   `Local`, `Toolkit`, `Companion`, `Pulse`, `Work` or `Launcher` match
   unrelated apps. Give them their vendor: `Seagate Toolkit`, not `Toolkit`.
5. **Do not invent names.** The prefix or qualifier must be how the vendor or
   its users refer to the product. Do not rename one product to its successor
   or to a sibling to dodge a collision.
6. **Use a code exception only as a last resort**, when the official name must
   stay, the vendor checks above cannot separate the apps, and the script
   still shows the other product. Add the README name and the scan's bundle ID
   to `SEPARATE_PRODUCTS` in `helpers/readme-scan-match.js` and a case to
   `test/prebuild/readme-scan-collisions.test.js`. `Netflix 4K on Safari`
   absorbs no scans at all, because it describes browser playback
   (`browser-playback-listing.test.js`).

After renaming, run the check again with the new name. A longer name can
collide in the other direction.

## When the company name is not enough

Scans often carry the bare vendor word as an alias: Yandex Disk's scan has
`Yandex`. The build ignores such an alias for partial matches unless it is the
scan's display name, so `Yandex Browser` no longer takes the Yandex Disk scans.
A display name still counts: a scan named just `Notion` would match `Notion
Calendar`, because the README name is that name plus extra words.

When the check script still shows a sibling product:

- Give every affected sibling its own README entry in the same change, each
  with its own evidence. Each listing then keeps a page. The first entry in
  the README still takes the siblings' bundle IDs and aliases, so say this in
  the PR.
- If a sibling has no evidence for its own entry, do not add the colliding
  entry. Leave the listings as they are and report the collision, or add a
  `SEPARATE_PRODUCTS` pair with a test (rule 6).

Collisions the vendor checks fixed on 2026-11-25, as examples of what goes
wrong: `.NET` had absorbed Battle.net and Wargaming.net Game Center; `Steam`
had absorbed Kingdom Rush Vengeance and an Automator stub named `Win-Steam`;
`Warp Terminal`, `HCL Notes`, `Sophos Home` and others had absorbed Apple's
Terminal, Notes and Home; `Electron Framework` had absorbed seven apps whose
executable is named `Electron`.

## When the URL changes

Renaming an existing README entry, or taking over a scan under a different
name, changes the slug. The old URL then stops resolving.

- Add a 301 from the old path to the new one in `REDIRECTS` in
  [`src/middleware-rules.js`](../src/middleware-rules.js). Existing examples:
  `/app/node` to `/app/nodejs`, `/app/git` to `/app/git-version-control`,
  `/app/electron` to `/app/electron-framework`.
- Follow the same pattern when a generic slug needs a clearer one: give the
  listing a descriptive name and redirect the short path.
- After deployment, open both the old and the new URL, as
  [app-flow](app-flow.md#required-contributor-follow-up) requires.

## Report it

In the review notes or PR description, name each entry that was renamed for a
collision, the listings it would otherwise have absorbed, and any redirect
added. If a collision cannot be resolved with these rules, leave the listing
unchanged and say so.

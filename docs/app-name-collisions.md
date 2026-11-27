# App name collisions

Read this before adding or renaming an entry in `README.md`. A README name
decides two things: the listing URL, and which scanned apps the entry absorbs.
A careless name can make another app's page disappear.

## How matching works

The build compares every README entry name with every alias of every scanned
app ([`helpers/build-app-list.js`](../helpers/build-app-list.js), using
`eitherMatches` in [`helpers/matching.js`](../helpers/matching.js)):

- Case is ignored.
- Same length: the two strings must be equal.
- Different length: the shorter string must appear as whole words inside the
  longer one. Punctuation counts as a word break, so `Yandex` matches
  `Yandex.Disk.2` and `Ray` matches `Blu-ray Player`.
- It works in both directions. A short README name matches longer scan aliases
  (`Automator` matches `Automator Application Stub`). A long README name
  matches any scan whose whole alias sits inside it (`Notion Calendar` matches
  a scan named `Calendar`).

A matching scan is merged into the README entry: its bundle IDs, aliases and
links move over, and the scan's own listing and URL are removed. README
entries are processed top to bottom, so the first matching entry takes the
scan.

The listing URL comes from the README name through `makeSlug`
([`helpers/slug.js`](../helpers/slug.js)): `Yandex Browser` becomes
`/app/yandex-browser`.

## Check a name before using it

```sh
node scripts/check-name-collisions.mjs "Yandex" "Yandex Browser"
```

It prints every live listing the name would match, the alias that caused each
match, the status, and bundle IDs. Exit code 2 means more than one listing
matched. The script reads the live list, so it shows scans that are still
separate today, plus README entries and what they have already absorbed.

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
   stay and still matches another product. Add a narrow rule in
   `buildReadmeAppList` and a regression test in `test/prebuild/`. Existing
   examples: `Android Studio` must not absorb BrickLink's `Studio`
   (`android-studio-listing.test.js`), and `Netflix 4K on Safari` must not
   absorb a Netflix wrapper app (`browser-playback-listing.test.js`).

After renaming, run the check again with the new name. A longer name can
collide in the other direction.

## When the company name is not enough

Scans often carry the bare vendor word as an alias. Yandex Disk's scan has the
alias `Yandex`, and Notion Desktop has `Notion`. A vendor-prefixed name
contains that word, so `Yandex Browser` still matches the Yandex Disk scans,
and `Notion Calendar` still matches Notion Desktop. The check script shows
this as `via alias "Yandex"`.

When that happens:

- Give every affected sibling its own README entry in the same change, each
  with its own evidence. Each listing then keeps a page. The first entry in
  the README still takes the siblings' bundle IDs and aliases, so say this in
  the PR.
- If a sibling has no evidence for its own entry, do not add the colliding
  entry. Leave the listings as they are and report the collision.
- A lasting fix belongs in the matching code, not in the name (for example,
  ignoring vendor-only aliases or comparing bundle IDs). Treat that as a
  separate code change with tests.

Collisions already live, as examples of what to avoid:

- `.NET` has absorbed Battle.net and Wargaming.net Game Center, because
  `.net` is a whole word inside both names.
- `Steam` has absorbed Kingdom Rush Vengeance and an Automator stub named
  `Win-Steam`.

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

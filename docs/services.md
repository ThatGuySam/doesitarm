# Services: cards, headline experiments and requests

Does It ARM offers a Logic upgrade audit (`/services/studio-upgrade-audit/`) and
short interest pages for six more offers, all listed on `/services/`:

| Page | `offer` stored | Price shown |
| --- | --- | --- |
| `/services/mac-fleet-readiness/` | `mac-fleet-readiness` | From $500 |
| `/services/audio-session-rescue/` | `audio-session-rescue` | From $500 |
| `/services/legacy-studio-hardware/` | `legacy-studio-hardware` | From $1,000 |
| `/services/windows-arm-purchase-check/` | `windows-arm-purchase-check` | From $1,000 |
| `/services/verified-test-report/` | `verified-test-report` | From $350 |
| `/services/abandoned-app-revival/` | `app-revival` (kind `revival`, typed `appName`) | Free |

These pages come from `servicePages` in `helpers/service-offers.js` and render
through `src/pages/services/[offer].astro`. Each has one interest form (kind
`waitlist`, or `revival` for the revival page).

## Edit copy

All wording lives in [`helpers/service-offers.js`](../helpers/service-offers.js):
headline pools (`serviceExperiments`), card subheads and buttons (`serviceCards`), the audit page, the services index, the revival
allowlist and the home search terms. Give a reworded headline a **new variant id**
so old and new results are not mixed.

To show a Logic screenshot or video on the audit page, set `auditPage.media.src`
(and `type: 'video'` for a video).

## Where cards show

At most one card per page, chosen by `getServiceCardType()`:

| Page | Card | Experiment |
| --- | --- | --- |
| Logic Pro and MainStage (`logicAppSlugs`) | `logic-native` (the only card with Logic copy) | `logic-headlines-v2` |
| Any other DAW or host, native or not (REAPER, Audacity, Ableton, Pro Tools, Cubase, FL Studio, Studio One, Bitwig, GarageBand...; `dawAppSlugs`, `dawNameTerms`) | `daw` (DAW-neutral subhead and button; some headlines use the app name) | `audio-headlines-v2` |
| Other audio software, native or not (Native Access, Melodyne, Waves Central, Kontakt...) | `audio` (DAW-neutral, never names an app) | `audio-headlines-v2` |
| `/app/*` on `revivalAllowlist` (e.g. True-Fi) | `revival` | `revival-v1` |
| `/kind/music-and-audio-tools/` | `audio`, above the ad in the search slot | `audio-headlines-v2` |
| `/` | `audio`, only while the search box text matches `audioSearchTerms` | `audio-headlines-v2` |
| Games, formulas, other apps | none | |

An `/app/*` listing counts as audio when it is in Music and Audio Tools, its
slug is in `audioAppSlugs`, or its name or an alias contains one of
`audioNameTerms` as whole words. Many scanned audio apps (Melodyne, Ableton,
Waves Central) have no category, so the slug list and name terms matter.

Non-native listings also show a subdued Parallels line. CrossOver links were removed.

### Headline exploration (v2, from 2026-11-27)

v1 (`audio-headlines-v1`, `audio-native-headlines-v1`, `daw-native-v1`) was a
small A/B test keyed per card type. v2 is a multi-arm exploration: each
experiment in `serviceExperiments` has a pool of headlines, and each browser gets
**one** variant per experiment, picked uniformly at random from the active
variants and kept in `localStorage` under `dia-svc-x:<experiment>`. The same
browser therefore sees the same variant on every page and card type in that
experiment (an Ableton page and a Native Access page both show, say, `op1`).
The subhead and buttons stay fixed per card type, so the headline is what varies.

- Every card type in an experiment has the same variant ids. A variant can carry
  other words for one card type in `byCard` (for example `mv1` names the app on
  the `daw` card). Tests check this.
- Retire a variant with `active: false`; never reuse an id for new wording. A
  changed pool (new or retired variants) is fine within exploration, but start a
  new experiment id (`-v3`) before running a confirmatory head-to-head test.
- `audio-headlines-v2` control is `d1` "Check your plug-ins before you upgrade.";
  `logic-headlines-v2` control is `na1`. Pools and sources for the wording are in
  the private copy research (`doesitarm-private/docs/research/audio-voc-2026-11-27/`).
- Quoted macOS messages (`mq*`, `rq*`) use exact text: "Support Ending for
  Intel-based Apps" is the title of the notification macOS 26.4 and later shows
  when Intel code launches ([Six Colors](https://sixcolors.com/post/2026/08/preparing-for-next-years-rosetta-2-demise/));
  "you need to install Rosetta" is from the alert "To open “App”, you need to
  install Rosetta. Do you want to install it now?" ([Apple](https://support.apple.com/en-us/102527)
  shows it as an image).

With ~19 arms, expect weeks before any arm has enough clicking browsers. Use the
exploration view below to browse, prune clear losers with `active: false`, and
only then run a two-arm test on the leaders under a new experiment id.

## Spam protection and notifications

- Every service form (card email form, revival form, scope, waitlist and the six
  interest pages) runs Cloudflare Turnstile (widget "Does It ARM services",
  managed mode, shown only when Cloudflare wants a click). The site key is
  `turnstileSiteKey` in `helpers/service-offers.js`; the secret is the Worker
  secret `TURNSTILE_SECRET`. The Worker verifies the token with siteverify and
  checks the hostname before storing. With the secret unset the Worker skips the
  check, and with an empty site key the forms render no widget. The honeypot and
  rate limits still apply.
- Each accepted request emails Sam through Email Routing (`send_email` binding
  `SERVICE_EMAIL`), from `SERVICE_NOTIFY_FROM` (`services@doesitarm.com`) to the
  Worker secret `SERVICE_NOTIFY_TO`, a verified Email Routing destination address.
  The address is a secret so it stays out of this public repo. Reply-To is the
  visitor. A failed email is logged and never fails the request.

## Storage

The subscriptions Worker (`workers/subscriptions`) stores both, in D1
`doesitarm-subscriptions` (migration `0007_create_service_requests.sql`):

- `service_events`: `event` (`impression` when half the card is visible,
  `click`, `submit`), `card`, `variant`, `control` (`primary`, `secondary`,
  `scope`, `waitlist`, `revival`), `experiment`, `browser`, `path`, `created_at`.
  `browser` is a random id kept in `localStorage` (`dia-svc-browser`); it is not
  tied to an IP, user agent or email. Rows before migration 0008 have empty
  `experiment` and `browser`.
- `service_exposures` (migration `0008_count_service_browsers.sql`): the first
  impression per `experiment`, `card` and `browser`, with the variant and page it
  saw. Later impressions from the same browser are ignored, so each browser counts once.
  The service page records `card = 'service-page'` with the variant and
  experiment of the card that sent the visitor (`?v=`, `?x=`), or `direct`.
- `service_requests`: email, `offer`, `kind` (`waitlist`, `scope`, `revival`),
  `app_slug`, `details` (JSON: `moveDate`, `daw`, `plugin`, `appName`, `note`), and the
  `card`/`variant`/`source` that produced it. One row per email, offer, kind and app.

No confirmation email is sent to the visitor. Sam gets a notification email
for each request (see above) and replies by hand.
The Rosetta launch switch does not affect these endpoints.

Cards also send GA4 events (`service_impression`, `service_click`,
`service_submit`) with `service_card`, `service_variant` and `service_control`.

## Read the results

From a machine with Wrangler logged in to the Does It ARM account (on Sam's Linux
desktop use `node /home/tiki/.npm/_npx/c943b712072b77c4/node_modules/wrangler/bin/wrangler.js`
in place of `npx wrangler`).

### v2 exploration (pooled across card types)

**Exploration view, sorted by CTR.** One row per experiment and variant. A
browser counts once per experiment, at its first exposure on any card type; a
clicker is an exposed browser with a card click in the same experiment after that
first exposure. `submitting_browsers` counts card form submits (the audit page
scope form is in the service-page query further down).

```sh
npx wrangler d1 execute doesitarm-subscriptions --remote --config workers/subscriptions/wrangler.jsonc --command "
WITH first_exposure AS (
    SELECT experiment, browser, variant, MIN(created_at) AS first_at
    FROM service_exposures
    WHERE experiment LIKE '%-v2' AND card != 'service-page'
    GROUP BY experiment, browser
),
acted AS (
    SELECT f.experiment, f.browser,
           MAX(e.event = 'click') AS clicked,
           MAX(e.event = 'click' AND e.control = 'primary') AS clicked_primary,
           MAX(e.event = 'submit') AS submitted
    FROM first_exposure f
    JOIN service_events e ON e.experiment = f.experiment AND e.browser = f.browser
    WHERE e.created_at >= f.first_at AND e.card != 'service-page'
    GROUP BY f.experiment, f.browser
)
SELECT f.experiment, f.variant,
       COUNT(*) AS exposed_browsers,
       COALESCE(SUM(a.clicked), 0) AS clicking_browsers,
       COALESCE(SUM(a.clicked_primary), 0) AS primary_clicking_browsers,
       COALESCE(SUM(a.submitted), 0) AS submitting_browsers,
       ROUND(100.0 * COALESCE(SUM(a.clicked), 0) / COUNT(*), 2) AS ctr_pct,
       ROUND(100.0 * COALESCE(SUM(a.clicked_primary), 0) / COUNT(*), 2) AS primary_ctr_pct
FROM first_exposure f
LEFT JOIN acted a ON a.experiment = f.experiment AND a.browser = f.browser
GROUP BY f.experiment, f.variant
ORDER BY f.experiment, ctr_pct DESC, exposed_browsers DESC"
```

`service_exposures` keeps one row per experiment, card type and browser, so
`MIN(created_at)` with `GROUP BY experiment, browser` picks the first card the
browser saw. Because the variant is sticky per experiment, all of a browser's
rows in one experiment carry the same variant.

**Per variant and card type** (same numbers split by `audio` and `daw`):

```sh
npx wrangler d1 execute doesitarm-subscriptions --remote --config workers/subscriptions/wrangler.jsonc --command "
SELECT x.experiment, x.card, x.variant,
       COUNT(*) AS exposed_browsers,
       COUNT(c.browser) AS clicking_browsers,
       ROUND(100.0 * COUNT(c.browser) / COUNT(*), 2) AS ctr_pct
FROM service_exposures x
LEFT JOIN (
    SELECT DISTINCT e.experiment, e.card, e.browser FROM service_events e
    JOIN service_exposures f USING (experiment, card, browser)
    WHERE e.event = 'click' AND e.created_at >= f.created_at
) c ON c.experiment = x.experiment AND c.card = x.card AND c.browser = x.browser
WHERE x.experiment LIKE '%-v2' AND x.card != 'service-page'
GROUP BY x.experiment, x.card, x.variant
ORDER BY x.experiment, x.card, ctr_pct DESC"
```

**Sticky check.** Should return no rows. A row means one browser saw two
variants in the same experiment (a delivery bug):

```sh
npx wrangler d1 execute doesitarm-subscriptions --remote --config workers/subscriptions/wrangler.jsonc --command "
SELECT experiment, browser, COUNT(DISTINCT variant) AS variants
FROM service_exposures WHERE experiment LIKE '%-v2'
GROUP BY 1, 2 HAVING variants > 1 LIMIT 20"
```

**Arrivals and requests per v2 variant** (service page visits carry `?x=` and
`?v=` from the card; requests store the card and variant):

```sh
npx wrangler d1 execute doesitarm-subscriptions --remote --config workers/subscriptions/wrangler.jsonc --command "
SELECT experiment, variant, COUNT(DISTINCT browser) AS browsers_arriving
FROM service_events WHERE card = 'service-page' AND event = 'impression' AND experiment LIKE '%-v2'
GROUP BY 1, 2 ORDER BY browsers_arriving DESC"

npx wrangler d1 execute doesitarm-subscriptions --remote --config workers/subscriptions/wrangler.jsonc --command "
SELECT card, variant, offer, kind, COUNT(DISTINCT email) AS requesters
FROM service_requests WHERE created_at >= '2026-11-27'
GROUP BY 1, 2, 3, 4 ORDER BY requesters DESC"
```

### v1 A/B test (per card type)

**Main result: unique browsers per variant.** Exposed browsers come from
`service_exposures`. A clicker is an exposed browser with at least one card click
in the same experiment and card type, after its first exposure. CTR is unique
clickers divided by unique exposed browsers.

```sh
npx wrangler d1 execute doesitarm-subscriptions --remote --config workers/subscriptions/wrangler.jsonc --command "
SELECT x.experiment, x.card, x.variant,
       COUNT(*) AS exposed_browsers,
       COUNT(c.browser) AS clicking_browsers,
       COUNT(p.browser) AS primary_clicking_browsers,
       ROUND(100.0 * COUNT(c.browser) / COUNT(*), 2) AS ctr_pct,
       ROUND(100.0 * COUNT(p.browser) / COUNT(*), 2) AS primary_ctr_pct
FROM service_exposures x
LEFT JOIN (
    SELECT DISTINCT e.experiment, e.card, e.browser FROM service_events e
    JOIN service_exposures f USING (experiment, card, browser)
    WHERE e.event = 'click' AND e.created_at >= f.created_at
) c ON c.experiment = x.experiment AND c.card = x.card AND c.browser = x.browser
LEFT JOIN (
    SELECT DISTINCT e.experiment, e.card, e.browser FROM service_events e
    JOIN service_exposures f USING (experiment, card, browser)
    WHERE e.event = 'click' AND e.control = 'primary' AND e.created_at >= f.created_at
) p ON p.experiment = x.experiment AND p.card = x.card AND p.browser = x.browser
WHERE x.experiment = 'audio-headlines-v1'
GROUP BY x.experiment, x.card, x.variant
ORDER BY x.variant"
```

Drop the `WHERE x.experiment = ...` line to see every experiment. Read a test
once, after its planned end date, and call a winner only with enough clicking
browsers per variant (see the copy research for the sample-size table).

**Diagnostics.** Exposures per variant should be close to equal (a large
imbalance means a delivery or logging bug). Clicks from browsers with no
recorded exposure point to a tracking gap:

```sh
npx wrangler d1 execute doesitarm-subscriptions --remote --config workers/subscriptions/wrangler.jsonc --command "
SELECT experiment, card, variant,
       COUNT(DISTINCT browser) AS clicking_browsers_without_exposure
FROM service_events e
WHERE event = 'click' AND browser != '' AND NOT EXISTS (
    SELECT 1 FROM service_exposures x
    WHERE x.experiment = e.experiment AND x.card = e.card AND x.browser = e.browser)
GROUP BY 1, 2, 3"
```

Requests that came from each variant (unique emails), and service page arrivals by
the card that sent them:

```sh
npx wrangler d1 execute doesitarm-subscriptions --remote --config workers/subscriptions/wrangler.jsonc --command "
SELECT card, variant, offer, kind, COUNT(DISTINCT email) AS requesters
FROM service_requests GROUP BY 1, 2, 3, 4 ORDER BY 1, 2"

npx wrangler d1 execute doesitarm-subscriptions --remote --config workers/subscriptions/wrangler.jsonc --command "
SELECT experiment, variant, COUNT(DISTINCT browser) AS browsers_arriving
FROM service_events WHERE card = 'service-page' AND event = 'impression'
GROUP BY 1, 2 ORDER BY 1, 2"
```

Raw page-view totals (every impression, not deduplicated; useful only for traffic
volume):

```sh
npx wrangler d1 execute doesitarm-subscriptions --remote --config workers/subscriptions/wrangler.jsonc --command "
SELECT experiment, card, variant,
       SUM(event = 'impression') AS impressions,
       SUM(event = 'click') AS clicks,
       SUM(event = 'submit') AS submits
FROM service_events
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3"
```

Requests (contains emails, so keep it out of shared logs):

```sh
npx wrangler d1 execute doesitarm-subscriptions --remote --config workers/subscriptions/wrangler.jsonc --command "
SELECT created_at, offer, kind, app_slug, email, details, card, variant, source
FROM service_requests ORDER BY created_at DESC LIMIT 50"
```

Counts only:

```sh
npx wrangler d1 execute doesitarm-subscriptions --remote --config workers/subscriptions/wrangler.jsonc --command "
SELECT offer, kind, card, variant, COUNT(*) AS requests FROM service_requests GROUP BY 1, 2, 3, 4"
```

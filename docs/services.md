# Services: cards, A/B headlines and requests

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
card headlines and subheads, the audit page, the services index, the revival
allowlist and the home search terms. Give a reworded headline a **new variant id**
so old and new results are not mixed.

To show a Logic screenshot or video on the audit page, set `auditPage.media.src`
(and `type: 'video'` for a video).

## Where cards show

At most one card per page, chosen by `getServiceCardType()`:

| Page | Card |
| --- | --- |
| Audio `/app/*`, not native | `audio` (4 headline variants) |
| Logic Pro and MainStage | `audio-native` (3 variants) |
| Native DAW other than Logic (Ableton, Pro Tools, Cubase, FL Studio, Studio One, Bitwig, GarageBand...) | `daw-native` (headline uses the app name, DAW-neutral subhead and button) |
| Other native audio apps (e.g. Melodyne, Waves Central, Omnisphere) | `audio-native` |
| `/app/*` on `revivalAllowlist` (e.g. True-Fi) | `revival` |
| `/kind/music-and-audio-tools/` | `audio`, above the ad in the search slot |
| `/` | `audio`, only while the search box text matches `audioSearchTerms` |
| Games, formulas, other apps | none |

An `/app/*` listing counts as audio when it is in Music and Audio Tools, its
slug is in `audioAppSlugs`, or its name or an alias contains one of
`audioNameTerms` as whole words. Many scanned audio apps (Melodyne, Ableton,
Waves Central) have no category, so the slug list and name terms matter.

Non-native listings also show a subdued Parallels line. CrossOver links were removed.

Each visitor gets one variant per card type, picked at random and kept in
`localStorage` (`dia-svc-variant:<card>`). Each card type also has an
`experiment` id in `serviceCards` (`audio-headlines-v1`, `audio-native-headlines-v1`,
`daw-native-v1`, `revival-v1`). Start a new experiment id whenever a headline set
changes, so results from different sets are never pooled.

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

## Read the A/B results

From a machine with Wrangler logged in to the Does It ARM account (on Sam's Linux
desktop use `node /home/tiki/.npm/_npx/c943b712072b77c4/node_modules/wrangler/bin/wrangler.js`
in place of `npx wrangler`).

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

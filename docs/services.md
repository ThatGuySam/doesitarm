# Services: cards, A/B headlines and requests

Does It ARM offers a Logic upgrade audit (`/services/studio-upgrade-audit/`) and a
free revival interest list for discontinued apps. `/services/` lists both.

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
| `/app/*` in Music and Audio Tools, not native | `audio` (4 headline variants) |
| `/app/*` in Music and Audio Tools, native (e.g. Logic Pro) | `audio-native` (3 variants) |
| `/app/*` on `revivalAllowlist` (e.g. True-Fi) | `revival` |
| `/kind/music-and-audio-tools/` | `audio`, above the ad in the search slot |
| `/` | `audio`, only while the search box text matches `audioSearchTerms` |
| Games, formulas, other apps | none |

Non-native listings also show a subdued Parallels line. CrossOver links were removed.

Each visitor gets one variant per card type, picked at random and kept in
`localStorage` (`dia-svc-variant:<card>`).

## Storage

The subscriptions Worker (`workers/subscriptions`) stores both, in D1
`doesitarm-subscriptions` (migration `0007_create_service_requests.sql`):

- `service_events`: `event` (`impression` when half the card is visible,
  `click`, `submit`), `card`, `variant`, `control` (`primary`, `secondary`,
  `scope`, `waitlist`, `revival`), `path`, `created_at`. No IP, user agent or email.
  The service page records `card = 'service-page'` with the variant of the card
  that sent the visitor (`?v=`), or `direct`.
- `service_requests`: email, `offer`, `kind` (`waitlist`, `scope`, `revival`),
  `app_slug`, `details` (JSON: `moveDate`, `daw`, `plugin`, `note`), and the
  `card`/`variant`/`source` that produced it. One row per email, offer, kind and app.

No confirmation or follow-up email is sent. Reply to requests by hand.
The Rosetta launch switch does not affect these endpoints.

Cards also send GA4 events (`service_impression`, `service_click`,
`service_submit`) with `service_card`, `service_variant` and `service_control`.

## Read the A/B results

From a machine with Wrangler logged in to the Does It ARM account:

```sh
npx wrangler d1 execute doesitarm-subscriptions --remote --config workers/subscriptions/wrangler.jsonc --command "
SELECT card, variant,
       SUM(event = 'impression') AS impressions,
       SUM(event = 'click') AS clicks,
       SUM(event = 'click' AND control = 'primary') AS primary_clicks,
       SUM(event = 'click' AND control = 'secondary') AS secondary_clicks,
       SUM(event = 'submit') AS submits,
       ROUND(100.0 * SUM(event = 'click') / MAX(SUM(event = 'impression'), 1), 2) AS ctr_pct
FROM service_events
GROUP BY card, variant
ORDER BY card, variant"
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

# Does It ARM subscriptions

The site-wide footer uses `POST /api/subscriptions` and the existing
`email_subscriptions` table. `GET /api/subscriptions/health` checks the D1 binding.

## Launch switch

[`helpers/rosetta-launch.js`](../../helpers/rosetta-launch.js) exports
`rosettaLaunchEnabled`, which is `false` by default. Both the frontend and the
subscriptions Worker read this value. While off, the new links and forms are
hidden, both Rosetta pages render the site's 404, and Rosetta email delivery
is disabled. The signup endpoint responds with “Signups are not open yet” and
the confirmation endpoint returns 404. The authenticated status check can
still establish and verify a baseline in dry-run.

Set `rosettaLaunchEnabled` to `true` in that file and deploy both the
subscriptions Worker and the frontend to open the feature. Confirm the
subscriptions Worker deployment first, then confirm the frontend deployment.
The Worker variable `ROSETTA_EMAIL_MODE` separately authorizes live delivery.
Its default is dry-run. Keep `rosettaLaunchEnabled` off until the launch setup
is ready.

## Signup and unsubscribe

`POST /api/subscriptions/interests` requires an allowed site `Origin`. It
accepts an email, interest kind and key, and source pathname. An app interest
must match the current catalog. The public pages and signup validation reuse a
validated catalog for up to five minutes per Cloudflare location. If the
catalog is unavailable, the site displays a temporary error. The notifier
reads a fresh catalog for each check.

Each interest is unique per email, kind, and key. Pending interests expire
72 hours after creation. Resubmitting a pending interest keeps its original
expiry. The Worker prunes expired interests for the address on signup and
for all addresses during checks. Each address can keep up to 20 pending
interests. At the cap, a new interest replaces the oldest pending interest
if it is at least 15 minutes old. If every pending interest is newer, the
Worker rejects the new signup.

The Worker queues at most one outstanding confirmation per normalized email
address and allows three confirmation send attempts per rolling 24 hours.
Definite provider blocks and rate limits release their attempts. Live delivery
tries new confirmations after signup and drains eligible pending confirmations
during checks. The link is valid for 48 hours from the live delivery attempt,
and individual signups can expire sooner. A signup uses the existing valid
link when available. Signing up again after the link expires requests a new one.

The confirmation page shows current, unexpired pending signups as unchecked
choices. Saving confirms only the interests selected and discards the other
pending interests for that address. After opting out, the interest requires
fresh confirmation.

`/api/subscriptions/unsubscribe` accepts an email client's one-click POST
without an `Origin`. It also serves a confirmation form for people following
the link. D1 stores no signup IP address or user agent. Wrangler configures
`INTEREST_IP_RATE_LIMIT` (10 attempts a minute per connection IP) and
`INTEREST_EMAIL_RATE_LIMIT` (3 attempts a minute per normalized address).
Cloudflare uses hashed keys and applies these limits approximately, per
location. Confirm the two namespace IDs in `wrangler.jsonc` are unused in the
account before the first deployment. Wrangler configures the bindings at
deploy time. [Cloudflare Workers rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)

Rosetta news and the waitlist collect confirmed interests for future email.
App status alerts have an automated sender. Add future waitlists in
[`helpers/subscription-interests.js`](../../helpers/subscription-interests.js).

## Checks and delivery

The Worker runs daily at 14:00 UTC. The subscriptions workflow calls the
authenticated `POST /api/subscriptions/check-rosetta` after deploy and reports
the result as a notice. The Vercel API deploy hook starts an asynchronous build.
The next check observes the new catalog once it is published.

The first baseline seeds automatically with at least 2,800 valid listings.
The threshold is defined by `rosettaBaselineMinimum` in
[`helpers/rosetta-catalog.js`](../../helpers/rosetta-catalog.js). A smaller
catalog with usable listings can seed the first baseline through silent
approval. A later check
refuses a catalog with fewer than 90% of the prior listings or with additions,
removals, and status changes affecting more than 2% of the prior snapshot.
One changed listing is allowed on small snapshots. The shared parser tolerates
one malformed row on small catalogs or up to 2% on larger catalogs, and the
check preserves prior rows where malformed entries could be mistaken for
removals. A refusal returns HTTP 409 with the reason, counts, and recovery
commands. The check preserves the last baseline and its status-notification queue.

### Recover a refused check

Run the command in `recovery.reviewCommand` or the workflow notice. If the
response only provides `retryCommand`, repair the published catalog first.
Set `OBSERVATION_ID` to the latest refused observation ID and use the same
`ROSETTA_CHECK_TOKEN` as the check endpoint.

```sh
review_url="https://doesitarm.com/api/subscriptions/review-rosetta?observation=${OBSERVATION_ID}"
curl -sS -X GET -H "Authorization: Bearer $ROSETTA_CHECK_TOKEN" "$review_url"
```

Review the changes, including `additionCount` and `removalCount`, and check
`notificationCount`, which counts emails without showing subscriber addresses.
Copy `acceptSilentlyCommand` to use the default.
An incorrect catalog can make an entire batch look like real changes, so
silence is the safer default. The recovery action itself sends no email.

```sh
curl -sS -X POST -H "Authorization: Bearer $ROSETTA_CHECK_TOKEN" "$review_url"
```

Notify approval is available for a verified `too-many-changes` update. Copy
`acceptAndNotifyCommand` or set
`EMAIL_COUNT` and `DELIVERY_MODE` to the preview's `notificationCount` and
`mode`. If the baseline, email count, or delivery mode changes, the Worker
returns 409 with commands to get a fresh preview.
An approval queues live email when sending is enabled and simulates alerts
in dry-run. A successful manual or scheduled check processes the queue in batches.

```sh
curl -sS -X POST -H "Authorization: Bearer $ROSETTA_CHECK_TOKEN" "$review_url&notify=$EMAIL_COUNT&mode=$DELIVERY_MODE"
curl -sS -X POST -H "Authorization: Bearer $ROSETTA_CHECK_TOKEN" 'https://doesitarm.com/api/subscriptions/check-rosetta'
```

Reviews for `catalog-shrank`, `initial-catalog-too-small`, and
`snapshot-incomplete` allow only silent approval. Verify the published catalog
before accepting it.

After silently approving a catalog shrink, expect the restored full catalog
to be refused again as `too-many-changes`. Review it and approve it silently a
second time. After silently seeding an undersized first baseline, the full
catalog previews the missing listings as additions. Approve that review
silently to avoid sending addition alerts.

Accepted checks record additions, status changes, and removals. Only additions
and status changes queue mail, and only for app subscribers who confirmed before
the observation and are still subscribed at claim time. If an app returns
within 30 days of its last accepted appearance, the Worker queues a message
only if its status changed. At 30 days or later, the Worker treats the return
as an addition. Dry-run status jobs are simulated permanently. Confirmations can
stay pending until live delivery is available or their signups expire.
Definite provider blocks return HTTP 502 and leave work pending.
Review `needs-review` and stale `sending` rows against Cloudflare Email Sending
Activity before retrying an ambiguous attempt.

Use aggregate queries to review activity without exposing subscriber addresses
in terminal or CI logs.

```sql
SELECT COUNT(*) AS snapshot_count FROM rosetta_app_snapshot;

SELECT datetime(observed_at / 1000, 'unixepoch') AS observed_utc,
       reason, previous_count, incoming_count, changed_count, bad_rows
FROM rosetta_observations
WHERE status = 'refused'
ORDER BY observed_at DESC LIMIT 20;

SELECT kind, interest_key, COUNT(*) AS subscribers
FROM interest_subscriptions
WHERE confirmed_at IS NOT NULL AND unsubscribed_at IS NULL
GROUP BY kind, interest_key;

SELECT state, COUNT(*) AS confirmations FROM interest_confirmations GROUP BY state;
SELECT mode, state, COUNT(*) AS notifications FROM rosetta_notifications GROUP BY mode, state;
```

## Before launch

1. Set the same randomly generated `ROSETTA_CHECK_TOKEN` in the subscriptions
   Worker secrets and GitHub Actions repository secrets. Keep `CF_D1_API_TOKEN`
   and `CF_API_TOKEN` configured for the respective deploy workflows. Check the
   rate-limit namespace IDs in `workers/subscriptions/wrangler.jsonc`.
2. With the launch switch off, deploy the subscriptions Worker with the workflow
   so it applies the pending D1 migrations. Check the first dry-run baseline
   against the published catalog and verify the off-state routes and forms on
   the frontend and Worker.
3. Set up Cloudflare Email Sending on the Workers Paid account. Onboard the
   sender domain and verify the DNS records Cloudflare requires. Set
   `CLOUDFLARE_EMAIL_ACCOUNT_ID` to that account ID and store an account-scoped
   API token with **Email Sending: Edit** as `CLOUDFLARE_EMAIL_API_TOKEN`.
   [Cloudflare Email Sending setup](https://developers.cloudflare.com/email-service/get-started/send-emails/)
   · [Email Sending API permissions](https://developers.cloudflare.com/api/resources/email_sending/methods/send/)
4. Choose `ROSETTA_EMAIL_FROM` on the onboarded domain and set
   `ROSETTA_MAILING_ADDRESS` to the sender's postal address. Review signup and
   privacy wording, retention for expired or unconfirmed signups, and mailing
   practices for news and waitlists. Verify confirmation and unsubscribe in a
   controlled environment before inviting public signups.
5. Review pending confirmations before enabling live delivery. When ready for
   public signups and delivery, set `ROSETTA_EMAIL_MODE=live` on the Worker and
   turn on `rosettaLaunchEnabled`. Confirm the subscriptions Worker deployment
   and its signup endpoint first, then confirm the frontend deployment and
   verify the Rosetta pages and forms.

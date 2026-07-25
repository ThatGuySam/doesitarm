# Does It ARM Subscriptions

This Worker captures the site-wide email-update form directly into the
`doesitarm-subscriptions` Cloudflare D1 database.

## Current boundary

- `POST /api/subscriptions` validates and stores a normalized email address.
- Submitting the same email again updates the existing row instead of creating
  a duplicate.
- `GET /api/subscriptions/health` verifies the D1 binding with `SELECT 1`; it
  never reads or returns subscriber records.
- The database stores email, subscription status, source, and timestamps. It
  does not store IP addresses or user-agent strings.
- No email delivery, Mailchimp synchronization, confirmation flow, subscriber
  export, or unsubscribe UI exists yet.

## Operations

Apply migrations before deploying the Worker:

```sh
pnpm exec wrangler d1 migrations apply doesitarm-subscriptions \
  --remote \
  --config workers/subscriptions/wrangler.jsonc

pnpm exec wrangler deploy \
  --config workers/subscriptions/wrangler.jsonc
```

The `Deploy Cloudflare Subscriptions` workflow runs the unit tests, applies
pending migrations, deploys the exact commit, and checks the live D1 binding
and CORS policy.

Use aggregate queries for routine verification so subscriber addresses do not
appear in terminal output or CI logs:

```sql
SELECT status, COUNT(*) AS subscriber_count
FROM email_subscriptions
GROUP BY status;
```

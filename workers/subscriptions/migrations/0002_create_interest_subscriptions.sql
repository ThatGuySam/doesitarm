CREATE TABLE interest_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL COLLATE NOCASE,
    kind TEXT NOT NULL CHECK (kind IN ('app-status', 'rosetta-news', 'waitlist')),
    interest_key TEXT NOT NULL,
    source TEXT NOT NULL,
    consent TEXT NOT NULL,
    unsubscribe_token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    unsubscribed_at TEXT,
    confirmed_at TEXT,
    UNIQUE (email, kind, interest_key),
    CHECK (
        (kind = 'rosetta-news' AND interest_key = '') OR
        (kind IN ('app-status', 'waitlist') AND interest_key <> '')
    )
);

CREATE INDEX interest_subscriptions_active_interest
    ON interest_subscriptions (kind, interest_key, created_at)
    WHERE unsubscribed_at IS NULL AND confirmed_at IS NOT NULL;

CREATE INDEX interest_subscriptions_pending_email
    ON interest_subscriptions (email, id)
    WHERE confirmed_at IS NULL AND unsubscribed_at IS NULL;

CREATE TABLE interest_confirmations (
    token TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE,
    state TEXT NOT NULL DEFAULT 'pending'
        CHECK (state IN ('pending', 'sending', 'accepted', 'confirmed', 'cancelled', 'rejected', 'needs-review')),
    attempted_at INTEGER,
    valid_until INTEGER,
    provider_message_id TEXT,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX interest_confirmations_outstanding_email
    ON interest_confirmations (email)
    WHERE state IN ('pending', 'sending', 'accepted', 'needs-review');

CREATE INDEX interest_confirmations_pending
    ON interest_confirmations (updated_at, token)
    WHERE state = 'pending';

CREATE INDEX interest_confirmations_email_attempts
    ON interest_confirmations (email, attempted_at)
    WHERE attempted_at IS NOT NULL;

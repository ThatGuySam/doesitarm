-- Service waitlist, scope and revival requests from /services and listing cards.
-- These are stored as submitted. No confirmation email is sent yet.
CREATE TABLE service_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL COLLATE NOCASE,
    offer TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('waitlist', 'scope', 'revival')),
    app_slug TEXT NOT NULL DEFAULT '',
    details TEXT NOT NULL DEFAULT '{}',
    card TEXT NOT NULL DEFAULT '',
    variant TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (email, offer, kind, app_slug)
);

CREATE INDEX service_requests_offer_created
    ON service_requests (offer, kind, created_at);

-- Anonymous A/B impressions and clicks for service cards. No IP, user agent or email.
CREATE TABLE service_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event TEXT NOT NULL CHECK (event IN ('impression', 'click', 'submit')),
    card TEXT NOT NULL,
    variant TEXT NOT NULL,
    control TEXT NOT NULL DEFAULT '',
    path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX service_events_card_variant
    ON service_events (card, variant, event, created_at);

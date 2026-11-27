CREATE TABLE rosetta_snapshot_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    observed_at INTEGER NOT NULL
);

INSERT INTO rosetta_snapshot_state (id, observed_at) VALUES (1, 0);

CREATE TABLE rosetta_app_snapshot (
    app_key TEXT PRIMARY KEY NOT NULL,
    app_name TEXT NOT NULL,
    status TEXT NOT NULL
);

CREATE TABLE rosetta_app_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_key TEXT NOT NULL,
    app_name TEXT NOT NULL,
    previous_status TEXT,
    current_status TEXT,
    observed_at INTEGER NOT NULL,
    UNIQUE (observed_at, app_key)
);

CREATE TABLE rosetta_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    change_id INTEGER NOT NULL REFERENCES rosetta_app_changes (id),
    subscription_id INTEGER NOT NULL REFERENCES interest_subscriptions (id),
    subscription_created_at TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('dry-run', 'live')),
    state TEXT NOT NULL DEFAULT 'pending'
        CHECK (state IN ('pending', 'sending', 'accepted', 'dry-run', 'cancelled', 'rejected', 'needs-review')),
    provider_message_id TEXT,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (change_id, subscription_id)
);

CREATE INDEX rosetta_notifications_pending
    ON rosetta_notifications (mode, id)
    WHERE state = 'pending';

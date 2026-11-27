ALTER TABLE rosetta_snapshot_state ADD COLUMN app_count INTEGER NOT NULL DEFAULT 0;

UPDATE rosetta_snapshot_state
SET app_count = (SELECT COUNT(*) FROM rosetta_app_snapshot)
WHERE id = 1;

CREATE TABLE rosetta_observations (
    id TEXT PRIMARY KEY NOT NULL,
    observed_at INTEGER NOT NULL,
    previous_count INTEGER NOT NULL,
    incoming_count INTEGER NOT NULL,
    changed_count INTEGER NOT NULL,
    bad_rows INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('accepted', 'refused', 'superseded')),
    reason TEXT,
    resolution TEXT CHECK (resolution IN ('silent', 'notify'))
);

CREATE INDEX rosetta_observations_status_time
    ON rosetta_observations (status, observed_at);

CREATE TABLE rosetta_review_catalogs (
    id TEXT PRIMARY KEY NOT NULL,
    baseline_observed_at INTEGER NOT NULL,
    apps TEXT NOT NULL,
    invalid_keys TEXT NOT NULL,
    unkeyed_rows INTEGER NOT NULL
);

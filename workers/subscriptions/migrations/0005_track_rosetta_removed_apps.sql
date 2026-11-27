CREATE TABLE rosetta_removed_apps (
    app_key TEXT PRIMARY KEY NOT NULL,
    last_status TEXT NOT NULL,
    last_seen_at INTEGER NOT NULL
);

CREATE INDEX rosetta_removed_apps_time ON rosetta_removed_apps (last_seen_at);

INSERT INTO rosetta_removed_apps (app_key, last_status, last_seen_at)
SELECT app_key, previous_status, observed_at
FROM (
    SELECT app_key, previous_status, observed_at,
        ROW_NUMBER() OVER (PARTITION BY app_key ORDER BY observed_at DESC) AS removal_rank
    FROM rosetta_app_changes
    WHERE current_status IS NULL AND previous_status IS NOT NULL
)
WHERE removal_rank = 1;

-- Snapshot rows are deleted before the Worker advances the accepted timestamp.
CREATE TRIGGER rosetta_remember_removed_app AFTER DELETE ON rosetta_app_snapshot
BEGIN
    INSERT INTO rosetta_removed_apps (app_key, last_status, last_seen_at)
    SELECT OLD.app_key, OLD.status, observed_at FROM rosetta_snapshot_state
    WHERE id = 1 AND observed_at > 0
    ON CONFLICT (app_key) DO UPDATE SET last_status = excluded.last_status, last_seen_at = excluded.last_seen_at
    WHERE excluded.last_seen_at >= rosetta_removed_apps.last_seen_at;
END;

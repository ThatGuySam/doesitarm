-- Count each browser once in service card A/B tests.
-- browser is a random id the page keeps in localStorage. It is not linked to an
-- email, IP or user agent. experiment names the headline test, e.g. audio-headlines-v1.
ALTER TABLE service_events ADD COLUMN experiment TEXT NOT NULL DEFAULT '';
ALTER TABLE service_events ADD COLUMN browser TEXT NOT NULL DEFAULT '';

CREATE INDEX service_events_experiment_browser
    ON service_events (experiment, card, event, browser);

-- First exposure per browser, card type and experiment, with the variant it saw.
CREATE TABLE service_exposures (
    experiment TEXT NOT NULL,
    card TEXT NOT NULL,
    browser TEXT NOT NULL,
    variant TEXT NOT NULL,
    path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (experiment, card, browser)
);

CREATE INDEX service_exposures_variant
    ON service_exposures (experiment, card, variant);

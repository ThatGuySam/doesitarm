CREATE INDEX interest_subscriptions_pending_created_at
    ON interest_subscriptions (created_at)
    WHERE confirmed_at IS NULL AND unsubscribed_at IS NULL;

CREATE INDEX rosetta_notifications_subscription
    ON rosetta_notifications (subscription_id);

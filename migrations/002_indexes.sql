create index if not exists idx_trades_user_created on trades(user_id, created_at desc);
create index if not exists idx_trades_user_outcome on trades(user_id, outcome);
create index if not exists idx_events_time_currency on economic_events(event_time, currency);
create index if not exists idx_ai_reviews_user_created on ai_reviews(user_id, created_at desc);

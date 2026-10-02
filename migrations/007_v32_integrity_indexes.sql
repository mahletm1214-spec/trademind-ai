create index if not exists idx_trades_user_closed_at on trades(user_id, closed_at);
create index if not exists idx_trades_user_outcome on trades(user_id, outcome);
create index if not exists idx_daily_reflections_user_date on daily_reflections(user_id, reflection_date desc);
create index if not exists idx_economic_events_event_time on economic_events(event_time);
create index if not exists idx_economic_events_impact_time on economic_events(impact, event_time);
create index if not exists idx_ai_reviews_user_created_at on ai_reviews(user_id, created_at desc);

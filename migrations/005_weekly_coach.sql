create index if not exists trades_user_closed_at on trades(user_id, closed_at desc);
create index if not exists trades_user_outcome on trades(user_id, outcome);

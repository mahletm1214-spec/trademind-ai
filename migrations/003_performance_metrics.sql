alter table trades add column if not exists realized_r numeric;
alter table trades add column if not exists pnl numeric;
create index if not exists idx_trades_user_closed_at on trades(user_id, closed_at);
create index if not exists idx_trades_user_outcome on trades(user_id, outcome);

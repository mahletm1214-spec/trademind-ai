create extension if not exists pgcrypto;
create table if not exists profiles(id uuid primary key default gen_random_uuid(), email text unique not null, display_name text, timezone text default 'UTC', created_at timestamptz default now());
create table if not exists trades(id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade, symbol text not null, direction text check(direction in ('LONG','SHORT')), entry numeric, stop numeric, target numeric, outcome text check(outcome in ('PLANNED','WIN','LOSS','BREAKEVEN')) default 'PLANNED', ict_model text, htf_bias text, draw_on_liquidity text, liquidity_sweep text, structure text, pd_array text, kill_zone text, notes text, opened_at timestamptz, closed_at timestamptz, created_at timestamptz default now(), risk_pct numeric, invalidation text, realized_r numeric, pnl numeric);
create table if not exists ai_reviews(id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade, trade_id uuid references trades(id) on delete set null, review_type text not null, input_json jsonb not null, output_json jsonb not null, created_at timestamptz default now());
create table if not exists economic_events(id uuid primary key default gen_random_uuid(), provider text not null, external_id text, currency text, title text not null, impact text check(impact in ('LOW','MEDIUM','HIGH')), event_time timestamptz not null, actual text, forecast text, previous text, raw_json jsonb, unique(provider, external_id));
create index if not exists trades_user_created on trades(user_id,created_at desc);
create index if not exists events_time on economic_events(event_time);

-- V18 secure authentication/session layer
create table if not exists auth_users(
  id uuid primary key references profiles(id) on delete cascade,
  password_hash text not null,
  password_salt text not null,
  role text not null default 'USER' check(role in ('USER','ADMIN')),
  last_login_at timestamptz,
  created_at timestamptz default now()
);
create table if not exists auth_sessions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  token_hash text unique not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);
create index if not exists auth_sessions_user on auth_sessions(user_id);
create index if not exists auth_sessions_expiry on auth_sessions(expires_at);

-- V19: provider-sync and personal-engine indexes
create index if not exists economic_events_currency_time on economic_events(currency,event_time);
create index if not exists ai_reviews_user_created on ai_reviews(user_id,created_at desc);

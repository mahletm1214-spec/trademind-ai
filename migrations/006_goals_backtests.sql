-- V29: goals + persistent backtest lab
create table if not exists goals(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade,
 title text not null, goal_type text not null default 'PROCESS', target_value numeric, current_value numeric default 0,
 unit text default '', deadline date, status text not null default 'ACTIVE' check(status in ('ACTIVE','COMPLETED','PAUSED')),
 notes text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create index if not exists goals_user_status on goals(user_id,status,deadline);
create table if not exists backtests(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id) on delete cascade,
 model text not null, sample_size int not null default 0, wins int default 0, losses int default 0, breakeven int default 0,
 win_rate numeric, total_r numeric, avg_r numeric, notes text, tested_at timestamptz default now(), created_at timestamptz default now()
);
create index if not exists backtests_user_model on backtests(user_id,model,created_at desc);

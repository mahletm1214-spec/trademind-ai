create table if not exists daily_reflections(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references profiles(id) on delete cascade,
 reflection_date date not null,
 happened text,
 learned text,
 good text,
 avoid text,
 next text,
 ai_insight text,
 created_at timestamptz default now(),
 updated_at timestamptz default now(),
 unique(user_id, reflection_date)
);
create index if not exists daily_reflections_user_date on daily_reflections(user_id, reflection_date desc);

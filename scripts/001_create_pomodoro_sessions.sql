-- Create pomodoro sessions table for synchronized timers
create table if not exists public.pomodoro_sessions (
  id uuid primary key default gen_random_uuid(),
  session_key text unique not null,
  state text not null default 'idle', -- idle, running, paused
  time_remaining integer not null default 1500, -- 25 minutes in seconds
  session_type text not null default 'work', -- work, break, long_break
  started_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create session participants table to track users in each session
create table if not exists public.session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.pomodoro_sessions(id) on delete cascade,
  user_name text not null,
  joined_at timestamptz default now(),
  unique(session_id, user_name)
);

-- Enable row level security
alter table public.pomodoro_sessions enable row level security;
alter table public.session_participants enable row level security;

-- Allow anyone to read sessions (public sessions)
create policy "sessions_select_all"
  on public.pomodoro_sessions for select
  using (true);

-- Allow anyone to insert sessions (create new sessions)
create policy "sessions_insert_all"
  on public.pomodoro_sessions for insert
  with check (true);

-- Allow anyone to update sessions (synchronized timer control)
create policy "sessions_update_all"
  on public.pomodoro_sessions for update
  using (true);

-- Allow participants to be viewed by anyone
create policy "participants_select_all"
  on public.session_participants for select
  using (true);

-- Allow anyone to join (insert participant)
create policy "participants_insert_all"
  on public.session_participants for insert
  with check (true);

-- Allow participants to leave (delete themselves)
create policy "participants_delete_all"
  on public.session_participants for delete
  using (true);

-- Enable realtime
alter publication supabase_realtime add table public.pomodoro_sessions;
alter publication supabase_realtime add table public.session_participants;

-- Add duration settings to pomodoro sessions
alter table public.pomodoro_sessions
add column work_duration integer not null default 1500, -- 25 minutes in seconds
add column break_duration integer not null default 300; -- 5 minutes in seconds

-- Update existing sessions to use default durations
update public.pomodoro_sessions
set work_duration = 1500,
    break_duration = 300
where work_duration is null or break_duration is null;

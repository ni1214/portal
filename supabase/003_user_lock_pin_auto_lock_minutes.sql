alter table public.user_lock_pins
add column if not exists auto_lock_minutes integer not null default 5;

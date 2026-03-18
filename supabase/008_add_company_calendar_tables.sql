create table if not exists public.company_calendar_settings (
  id text primary key,
  work_saturdays text[] not null default '{}',
  planned_leave_saturdays text[] not null default '{}',
  holiday_ranges jsonb not null default '[]'::jsonb,
  events jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.public_attendance_months (
  year_month text primary key,
  days jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_company_calendar_settings_updated_at
  on public.company_calendar_settings(updated_at desc);

create index if not exists idx_public_attendance_months_updated_at
  on public.public_attendance_months(updated_at desc);

drop trigger if exists trg_company_calendar_settings_updated_at on public.company_calendar_settings;
create trigger trg_company_calendar_settings_updated_at
before update on public.company_calendar_settings
for each row
execute function public.set_updated_at();

drop trigger if exists trg_public_attendance_months_updated_at on public.public_attendance_months;
create trigger trg_public_attendance_months_updated_at
before update on public.public_attendance_months
for each row
execute function public.set_updated_at();

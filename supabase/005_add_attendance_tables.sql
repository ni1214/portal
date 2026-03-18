create table if not exists public.attendance_sites (
  id text primary key,
  code text not null default '',
  name text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true,
  updated_by text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.attendance_entries (
  username text not null references public.user_accounts(username) on delete cascade,
  entry_date date not null,
  type text check (type is null or type in ('有給', '半休午前', '半休午後', '欠勤')),
  hayade text,
  zangyo text,
  note text,
  work_site_hours jsonb not null default '{}'::jsonb,
  project_keys text[] not null default '{}',
  year_month text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (username, entry_date)
);

create index if not exists idx_attendance_sites_active_order
  on public.attendance_sites(active, sort_order, code);

create index if not exists idx_attendance_entries_user_month_date
  on public.attendance_entries(username, year_month, entry_date);

create index if not exists idx_attendance_entries_project_keys
  on public.attendance_entries using gin (project_keys);

drop trigger if exists trg_attendance_sites_updated_at on public.attendance_sites;
create trigger trg_attendance_sites_updated_at
before update on public.attendance_sites
for each row
execute function public.set_updated_at();

drop trigger if exists trg_attendance_entries_updated_at on public.attendance_entries;
create trigger trg_attendance_entries_updated_at
before update on public.attendance_entries
for each row
execute function public.set_updated_at();

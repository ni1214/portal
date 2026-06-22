-- Google login mapping and trouble report workspace.
-- Keeps existing username-based runtime tables intact while linking a Google account.

alter table public.user_accounts
add column if not exists google_auth_id text,
add column if not exists google_email text not null default '',
add column if not exists google_name text not null default '',
add column if not exists google_avatar_url text not null default '',
add column if not exists login_provider text not null default 'nickname',
add column if not exists last_google_login_at timestamptz;

create unique index if not exists idx_user_accounts_google_auth_id
  on public.user_accounts(google_auth_id)
  where google_auth_id is not null;

create unique index if not exists idx_user_accounts_google_email
  on public.user_accounts(google_email)
  where google_email <> '';

create table if not exists public.trouble_reports (
  id text primary key,
  report_date date not null default current_date,
  reporter_username text not null default '',
  reporter_email text not null default '',
  department text not null default '',
  mistake_type text not null default 'その他'
    check (mistake_type in ('現場ミス', '設計ミス', '展開ミス', '工場ミス', '工事ミス', '外注ミス', 'その他')),
  title text not null default '',
  occurrence_location text not null default '',
  detail text not null default '',
  cause text not null default '',
  corrective_action text not null default '',
  prevention_action text not null default '',
  keywords text not null default '',
  status text not null default 'submitted'
    check (status in ('submitted', 'reviewing', 'done', 'archived')),
  assignee text not null default '',
  admin_note text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_trouble_reports_status_created
  on public.trouble_reports(status, created_at desc);

create index if not exists idx_trouble_reports_title_created
  on public.trouble_reports(title, created_at desc);

create index if not exists idx_trouble_reports_mistake_type_created
  on public.trouble_reports(mistake_type, created_at desc);

create index if not exists idx_trouble_reports_reporter_created
  on public.trouble_reports(reporter_username, created_at desc);

drop trigger if exists trg_trouble_reports_updated_at on public.trouble_reports;
create trigger trg_trouble_reports_updated_at
before update on public.trouble_reports
for each row execute function public.set_updated_at();

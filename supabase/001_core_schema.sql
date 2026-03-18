-- Portal / Supabase core schema
-- Phase 1: shared core + user core
-- Note:
--   - Current nickname-login UX is preserved first.
--   - RLS / auth policy design is intentionally deferred until adapter phase.
--   - Table names and keys favor smooth Firestore migration over deep normalization.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.portal_config (
  id integer primary key default 1 check (id = 1),
  pin_hash text,
  invite_code_hash text,
  invite_code_plain text,
  invite_updated_at timestamptz,
  gemini_api_key text,
  departments text[] not null default '{}',
  suggestion_box_viewers text[] not null default '{}',
  mission_text text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.portal_config (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.user_accounts (
  username text primary key,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_login_at timestamptz
);

create table if not exists public.user_profiles (
  username text primary key references public.user_accounts(username) on delete cascade,
  real_name text not null default '',
  department text not null default '',
  role_type text not null default 'member' check (role_type in ('member', 'leader', 'manager')),
  email text not null default '',
  phone text not null default '',
  signature_template text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_preferences (
  username text primary key references public.user_accounts(username) on delete cascade,
  theme text not null default 'dark',
  font_size text not null default 'font-md',
  fav_only boolean not null default false,
  favorites text[] not null default '{}',
  collapsed_sections text[] not null default '{}',
  collapse_seeded boolean not null default false,
  hidden_cards text[] not null default '{}',
  mission_banner_hidden boolean not null default true,
  last_viewed_suggestions_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_lock_pins (
  username text primary key references public.user_accounts(username) on delete cascade,
  enabled boolean not null default false,
  hash text,
  auto_lock_minutes integer not null default 5,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_section_orders (
  username text primary key references public.user_accounts(username) on delete cascade,
  order_ids text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_chat_reads (
  username text not null references public.user_accounts(username) on delete cascade,
  room_key text not null,
  read_at timestamptz not null default timezone('utc', now()),
  primary key (username, room_key)
);

create table if not exists public.user_drive_links (
  username text primary key references public.user_accounts(username) on delete cascade,
  url text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_drive_contacts (
  username text not null references public.user_accounts(username) on delete cascade,
  contact_username text not null,
  url text not null default '',
  saved_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (username, contact_username)
);

create table if not exists public.public_categories (
  id text primary key,
  label text not null,
  icon text not null default 'fa-solid fa-folder',
  color_index integer not null default 1,
  order_index integer not null default 0,
  is_external boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.public_cards (
  id text primary key,
  label text not null,
  icon text not null default 'fa-solid fa-link',
  url text not null default '#',
  category_id text not null references public.public_categories(id) on delete restrict,
  parent_id text references public.public_cards(id) on delete set null,
  order_index integer not null default 0,
  category_order integer not null default 0,
  is_external_tool boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.notices (
  id text primary key,
  title text not null default '',
  body text not null default '',
  priority text not null default 'normal' check (priority in ('normal', 'urgent')),
  target_scope text not null default 'all' check (target_scope in ('all', 'departments')),
  target_departments text[] not null default '{}',
  require_acknowledgement boolean not null default false,
  acknowledged_by text[] not null default '{}',
  created_by text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.notice_reactions (
  notice_id text not null references public.notices(id) on delete cascade,
  emoji text not null,
  username text not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (notice_id, emoji, username)
);

create table if not exists public.user_notice_reads (
  username text not null references public.user_accounts(username) on delete cascade,
  notice_id text not null references public.notices(id) on delete cascade,
  read_at timestamptz not null default timezone('utc', now()),
  primary key (username, notice_id)
);

create table if not exists public.cross_dept_requests (
  id text primary key,
  title text not null default '',
  project_key text not null default '',
  to_dept text not null default '',
  from_dept text not null default '',
  content text not null default '',
  proposal text not null default '',
  remarks text not null default '',
  status text not null default 'submitted' check (status in ('submitted', 'reviewing', 'accepted', 'rejected')),
  created_by text not null default '',
  status_note text not null default '',
  status_updated_by text not null default '',
  archived boolean not null default false,
  notify_creator boolean not null default false,
  linked_task_id text,
  linked_task_status text check (linked_task_status is null or linked_task_status in ('pending', 'accepted', 'done', 'cancelled')),
  linked_task_assigned_to text,
  linked_task_linked_by text,
  linked_task_linked_at timestamptz,
  linked_task_closed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.assigned_tasks (
  id text primary key,
  title text not null default '',
  description text not null default '',
  assigned_by text not null default '',
  assigned_to text not null default '',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'done', 'cancelled')),
  due_date text not null default '',
  project_key text not null default '',
  source_type text not null default 'manual' check (source_type in ('manual', 'cross_dept_request')),
  source_request_id text references public.cross_dept_requests(id) on delete set null,
  source_request_from_dept text,
  source_request_to_dept text,
  notified_done boolean not null default false,
  shared_with text[] not null default '{}',
  shared_responses jsonb not null default '{}'::jsonb,
  accepted_at timestamptz,
  done_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.private_sections (
  id text primary key,
  username text not null references public.user_accounts(username) on delete cascade,
  label text not null,
  icon text not null default 'fa-solid fa-star',
  color_index integer not null default 1,
  order_index integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.private_cards (
  id text primary key,
  username text not null references public.user_accounts(username) on delete cascade,
  label text not null,
  icon text not null default 'fa-solid fa-link',
  url text not null default '#',
  section_id text not null references public.private_sections(id) on delete cascade,
  parent_id text references public.private_cards(id) on delete set null,
  order_index integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_todos (
  id text primary key,
  username text not null references public.user_accounts(username) on delete cascade,
  text text not null,
  done boolean not null default false,
  due_date date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

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

create table if not exists public.user_email_contacts (
  username text not null references public.user_accounts(username) on delete cascade,
  contact_id text not null,
  company_name text not null default '',
  person_name text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (username, contact_id)
);

create index if not exists idx_public_categories_order
  on public.public_categories(order_index, label);

create index if not exists idx_public_cards_category_order
  on public.public_cards(category_id, category_order, order_index);

create index if not exists idx_notices_created_at
  on public.notices(created_at desc);

create index if not exists idx_notice_reactions_notice
  on public.notice_reactions(notice_id, emoji);

create index if not exists idx_private_sections_user_order
  on public.private_sections(username, order_index);

create index if not exists idx_private_cards_user_parent_order
  on public.private_cards(username, section_id, parent_id, order_index);

create index if not exists idx_user_todos_user_created
  on public.user_todos(username, created_at);

create index if not exists idx_user_notice_reads_notice
  on public.user_notice_reads(notice_id, username);

create index if not exists idx_cross_dept_requests_to_dept_status
  on public.cross_dept_requests(to_dept, status, archived, created_at desc);

create index if not exists idx_cross_dept_requests_created_by
  on public.cross_dept_requests(created_by, archived, updated_at desc);

create index if not exists idx_cross_dept_requests_project_key
  on public.cross_dept_requests(project_key, created_at desc);

create index if not exists idx_assigned_tasks_assigned_to_status
  on public.assigned_tasks(assigned_to, status, created_at desc);

create index if not exists idx_assigned_tasks_assigned_by_status
  on public.assigned_tasks(assigned_by, status, created_at desc);

create index if not exists idx_assigned_tasks_project_key
  on public.assigned_tasks(project_key, created_at desc);

create index if not exists idx_assigned_tasks_source_request
  on public.assigned_tasks(source_request_id);

create index if not exists idx_assigned_tasks_shared_with
  on public.assigned_tasks using gin (shared_with);

create index if not exists idx_user_email_contacts_user_created
  on public.user_email_contacts(username, created_at);

create index if not exists idx_user_chat_reads_user_room
  on public.user_chat_reads(username, room_key);

create index if not exists idx_attendance_sites_active_order
  on public.attendance_sites(active, sort_order, code);

create index if not exists idx_attendance_entries_user_month_date
  on public.attendance_entries(username, year_month, entry_date);

create index if not exists idx_attendance_entries_project_keys
  on public.attendance_entries using gin (project_keys);

drop trigger if exists trg_portal_config_updated_at on public.portal_config;
create trigger trg_portal_config_updated_at
before update on public.portal_config
for each row
execute function public.set_updated_at();

drop trigger if exists trg_user_accounts_updated_at on public.user_accounts;
create trigger trg_user_accounts_updated_at
before update on public.user_accounts
for each row
execute function public.set_updated_at();

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function public.set_updated_at();

drop trigger if exists trg_user_preferences_updated_at on public.user_preferences;
create trigger trg_user_preferences_updated_at
before update on public.user_preferences
for each row
execute function public.set_updated_at();

drop trigger if exists trg_user_lock_pins_updated_at on public.user_lock_pins;
create trigger trg_user_lock_pins_updated_at
before update on public.user_lock_pins
for each row
execute function public.set_updated_at();

drop trigger if exists trg_user_section_orders_updated_at on public.user_section_orders;
create trigger trg_user_section_orders_updated_at
before update on public.user_section_orders
for each row
execute function public.set_updated_at();

drop trigger if exists trg_user_drive_links_updated_at on public.user_drive_links;
create trigger trg_user_drive_links_updated_at
before update on public.user_drive_links
for each row
execute function public.set_updated_at();

drop trigger if exists trg_user_drive_contacts_updated_at on public.user_drive_contacts;
create trigger trg_user_drive_contacts_updated_at
before update on public.user_drive_contacts
for each row
execute function public.set_updated_at();

drop trigger if exists trg_public_categories_updated_at on public.public_categories;
create trigger trg_public_categories_updated_at
before update on public.public_categories
for each row
execute function public.set_updated_at();

drop trigger if exists trg_public_cards_updated_at on public.public_cards;
create trigger trg_public_cards_updated_at
before update on public.public_cards
for each row
execute function public.set_updated_at();

drop trigger if exists trg_notices_updated_at on public.notices;
create trigger trg_notices_updated_at
before update on public.notices
for each row
execute function public.set_updated_at();

drop trigger if exists trg_cross_dept_requests_updated_at on public.cross_dept_requests;
create trigger trg_cross_dept_requests_updated_at
before update on public.cross_dept_requests
for each row
execute function public.set_updated_at();

drop trigger if exists trg_assigned_tasks_updated_at on public.assigned_tasks;
create trigger trg_assigned_tasks_updated_at
before update on public.assigned_tasks
for each row
execute function public.set_updated_at();

drop trigger if exists trg_private_sections_updated_at on public.private_sections;
create trigger trg_private_sections_updated_at
before update on public.private_sections
for each row
execute function public.set_updated_at();

drop trigger if exists trg_private_cards_updated_at on public.private_cards;
create trigger trg_private_cards_updated_at
before update on public.private_cards
for each row
execute function public.set_updated_at();

drop trigger if exists trg_user_todos_updated_at on public.user_todos;
create trigger trg_user_todos_updated_at
before update on public.user_todos
for each row
execute function public.set_updated_at();

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

drop trigger if exists trg_user_email_contacts_updated_at on public.user_email_contacts;
create trigger trg_user_email_contacts_updated_at
before update on public.user_email_contacts
for each row
execute function public.set_updated_at();

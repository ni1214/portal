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
  parent_section_id text references public.private_sections(id) on delete set null,
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
  on public.private_cards(username, parent_section_id, order_index);

create index if not exists idx_user_todos_user_created
  on public.user_todos(username, created_at);

create index if not exists idx_user_notice_reads_notice
  on public.user_notice_reads(notice_id, username);

create index if not exists idx_user_email_contacts_user_created
  on public.user_email_contacts(username, created_at);

create index if not exists idx_user_chat_reads_user_room
  on public.user_chat_reads(username, room_key);

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

drop trigger if exists trg_user_email_contacts_updated_at on public.user_email_contacts;
create trigger trg_user_email_contacts_updated_at
before update on public.user_email_contacts
for each row
execute function public.set_updated_at();

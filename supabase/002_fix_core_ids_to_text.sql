-- Fix Firestore-backed IDs to remain text-based.
-- 001 was first applied with uuid keys for some tables.
-- We keep Firestore document IDs as-is to simplify migration and parent-child relations.

drop table if exists public.user_notice_reads;
drop table if exists public.notice_reactions;
drop table if exists public.notices;
drop table if exists public.public_cards;
drop table if exists public.private_cards;
drop table if exists public.private_sections;
drop table if exists public.user_todos;

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

-- user_todos テーブル
-- PK: id (text)
create table if not exists public.user_todos (
  id          text primary key,
  username    text not null,
  text        text not null default '',
  done        boolean not null default false,
  due_date    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

create index if not exists user_todos_username_idx on public.user_todos (username);

-- user_email_contacts テーブル
-- PK: contact_id (text) ← GPT Codex 移行時の命名に合わせる
create table if not exists public.user_email_contacts (
  contact_id   text primary key,
  username     text not null,
  company_name text not null default '',
  person_name  text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);

create index if not exists user_email_contacts_username_idx on public.user_email_contacts (username);

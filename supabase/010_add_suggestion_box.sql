-- 目安箱テーブル（suggestion_box → Supabase移行）
create table if not exists public.suggestion_box (
  id text primary key,
  content text not null,
  created_by text not null default 'anonymous',
  is_anonymous boolean not null default false,
  archived boolean not null default false,
  admin_reply text,
  replied_by text,
  replied_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger suggestion_box_updated_at
  before update on public.suggestion_box
  for each row execute function public.set_updated_at();

-- チャットルーム（DM・グループ共通）
create table if not exists public.chat_rooms (
  id text primary key,
  type text not null check (type in ('dm', 'group')),
  name text not null default '',
  members text[] not null default '{}',
  created_by text not null default '',
  last_message text not null default '',
  last_at timestamptz,
  last_sender text not null default '',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_chat_rooms_members on public.chat_rooms using gin(members);
create index if not exists idx_chat_rooms_last_at on public.chat_rooms(last_at desc);

-- チャットメッセージ
create table if not exists public.chat_messages (
  id text primary key default gen_random_uuid()::text,
  room_id text not null references public.chat_rooms(id) on delete cascade,
  username text not null,
  text text not null default '',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_chat_messages_room_id on public.chat_messages(room_id, created_at asc);

-- チャット既読管理
create table if not exists public.user_chat_reads (
  username text not null,
  room_key text not null,
  read_at  timestamptz not null default timezone('utc', now()),
  primary key (username, room_key)
);

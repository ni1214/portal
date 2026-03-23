-- P2P WebRTC シグナリング
create table if not exists public.p2p_signals (
  id text primary key,
  "from" text not null,
  "to" text not null,
  file_name text not null default '',
  file_size bigint not null default 0,
  file_type text not null default '',
  status text not null default 'pending',
  offer text,
  answer text,
  from_candidates text[] not null default '{}',
  to_candidates text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_p2p_signals_to on public.p2p_signals("to");
create index if not exists idx_p2p_signals_created_at on public.p2p_signals(created_at);

-- Drive 共有通知
create table if not exists public.drive_shares (
  id text primary key default gen_random_uuid()::text,
  "from" text not null,
  "to" text not null,
  drive_url text not null default '',
  message text not null default '',
  status text not null default 'pending',
  viewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_drive_shares_to on public.drive_shares("to");
create index if not exists idx_drive_shares_from on public.drive_shares("from");

-- ICE候補をアトミックに追記するRPC
create or replace function append_p2p_candidate(
  p_session_id text,
  p_role text,
  p_candidate text
) returns void as $$
begin
  if p_role = 'from' then
    update public.p2p_signals
    set from_candidates = from_candidates || array[p_candidate]
    where id = p_session_id;
  else
    update public.p2p_signals
    set to_candidates = to_candidates || array[p_candidate]
    where id = p_session_id;
  end if;
end;
$$ language plpgsql;

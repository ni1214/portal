-- Drive-style shared link metadata. Existing rows keep working through defaults.
alter table public.public_cards
  add column if not exists description text not null default '',
  add column if not exists thumbnail_url text not null default '',
  add column if not exists link_type text not null default 'other',
  add column if not exists tags text[] not null default '{}',
  add column if not exists last_opened_at timestamptz,
  add column if not exists open_count integer not null default 0,
  add column if not exists updated_by text not null default '';

alter table public.private_cards
  add column if not exists description text not null default '',
  add column if not exists thumbnail_url text not null default '',
  add column if not exists link_type text not null default 'other',
  add column if not exists tags text[] not null default '{}',
  add column if not exists last_opened_at timestamptz,
  add column if not exists open_count integer not null default 0;

alter table public.user_preferences
  add column if not exists shared_links_view_mode text not null default 'grid',
  add column if not exists shared_links_thumbnail_mode boolean not null default true,
  add column if not exists shared_links_sort_mode text not null default 'category';

create index if not exists idx_public_cards_link_type on public.public_cards(link_type);
create index if not exists idx_public_cards_last_opened_at on public.public_cards(last_opened_at desc);
create index if not exists idx_private_cards_link_type on public.private_cards(link_type);

-- Drive リンク管理テーブル（file-transfer.js が使用）

-- 自分のDriveフォルダURL（1ユーザー1件）
create table if not exists public.user_drive_links (
  username text primary key references public.user_accounts(username) on delete cascade,
  url text not null default '',
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists trg_user_drive_links_updated_at on public.user_drive_links;
create trigger trg_user_drive_links_updated_at
before update on public.user_drive_links
for each row
execute function public.set_updated_at();

-- Drive連絡先（相手ユーザーのDriveフォルダURLを保持）
create table if not exists public.user_drive_contacts (
  username text not null references public.user_accounts(username) on delete cascade,
  contact_username text not null,
  url text not null default '',
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (username, contact_username)
);

create index if not exists idx_user_drive_contacts_username
  on public.user_drive_contacts(username);

drop trigger if exists trg_user_drive_contacts_updated_at on public.user_drive_contacts;
create trigger trg_user_drive_contacts_updated_at
before update on public.user_drive_contacts
for each row
execute function public.set_updated_at();

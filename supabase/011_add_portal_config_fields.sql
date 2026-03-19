-- portal_config に発注・メール設定フィールドを追加
alter table public.portal_config
  add column if not exists gas_order_url text not null default '',
  add column if not exists order_seed_version integer not null default 0,
  add column if not exists gemini_api_key text not null default '';

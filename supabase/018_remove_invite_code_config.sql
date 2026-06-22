alter table if exists public.portal_config
  drop column if exists invite_code_hash,
  drop column if exists invite_code_plain,
  drop column if exists invite_updated_at;

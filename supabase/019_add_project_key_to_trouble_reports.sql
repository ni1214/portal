alter table if exists public.trouble_reports
  add column if not exists project_key text not null default '',
  add column if not exists site_id text;

create index if not exists idx_trouble_reports_project_key_created
  on public.trouble_reports(project_key, created_at desc);

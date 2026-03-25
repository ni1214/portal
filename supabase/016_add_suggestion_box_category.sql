alter table public.suggestion_box
  add column if not exists category text not null default 'other';

create index if not exists idx_suggestion_box_category_created_at
  on public.suggestion_box(category, created_at desc);

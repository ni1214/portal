drop index if exists public.idx_private_cards_user_parent_order;

alter table public.private_cards
drop column if exists parent_section_id;

alter table public.private_cards
add column if not exists section_id text references public.private_sections(id) on delete cascade;

alter table public.private_cards
add column if not exists parent_id text references public.private_cards(id) on delete set null;

alter table public.private_cards
alter column section_id set not null;

create index if not exists idx_private_cards_user_parent_order
  on public.private_cards(username, section_id, parent_id, order_index);

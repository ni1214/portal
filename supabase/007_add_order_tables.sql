create table if not exists public.order_suppliers (
  id text primary key,
  name text not null default '',
  email text not null default '',
  tel text not null default '',
  address text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.order_items (
  id text primary key,
  supplier_id text references public.order_suppliers(id) on delete set null,
  item_category text not null default '',
  name text not null default '',
  spec text not null default '',
  unit text not null default '',
  default_qty numeric not null default 1,
  order_type text not null default 'both' check (order_type in ('both', 'factory', 'site')),
  material_type text not null default 'steel' check (material_type in ('steel', 'stainless')),
  available_lengths text[] not null default '{}',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.orders (
  id text primary key,
  supplier_id text references public.order_suppliers(id) on delete set null,
  supplier_name text not null default '',
  supplier_email text not null default '',
  order_type text not null default 'factory' check (order_type in ('factory', 'site')),
  site_name text,
  project_key text not null default '',
  items jsonb not null default '[]'::jsonb,
  ordered_by text not null default '',
  note text not null default '',
  ordered_at timestamptz not null default timezone('utc', now()),
  email_sent boolean not null default false,
  email_sent_at timestamptz,
  deleted_at timestamptz,
  deleted_by text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_order_suppliers_active_name
  on public.order_suppliers(active, name);

create index if not exists idx_order_items_supplier_sort
  on public.order_items(supplier_id, sort_order, item_category, spec);

create index if not exists idx_order_items_order_type_material
  on public.order_items(order_type, material_type, active, sort_order);

create index if not exists idx_orders_ordered_at
  on public.orders(ordered_at desc);

create index if not exists idx_orders_supplier_ordered_at
  on public.orders(supplier_id, ordered_at desc);

create index if not exists idx_orders_project_key_ordered_at
  on public.orders(project_key, ordered_at desc);

create index if not exists idx_orders_deleted_at_ordered_at
  on public.orders(deleted_at, ordered_at desc);

drop trigger if exists trg_order_suppliers_updated_at on public.order_suppliers;
create trigger trg_order_suppliers_updated_at
before update on public.order_suppliers
for each row
execute function public.set_updated_at();

drop trigger if exists trg_order_items_updated_at on public.order_items;
create trigger trg_order_items_updated_at
before update on public.order_items
for each row
execute function public.set_updated_at();

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
before update on public.orders
for each row
execute function public.set_updated_at();

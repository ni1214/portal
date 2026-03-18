create table if not exists public.cross_dept_requests (
  id text primary key,
  title text not null default '',
  project_key text not null default '',
  to_dept text not null default '',
  from_dept text not null default '',
  content text not null default '',
  proposal text not null default '',
  remarks text not null default '',
  status text not null default 'submitted' check (status in ('submitted', 'reviewing', 'accepted', 'rejected')),
  created_by text not null default '',
  status_note text not null default '',
  status_updated_by text not null default '',
  archived boolean not null default false,
  notify_creator boolean not null default false,
  linked_task_id text,
  linked_task_status text check (linked_task_status is null or linked_task_status in ('pending', 'accepted', 'done', 'cancelled')),
  linked_task_assigned_to text,
  linked_task_linked_by text,
  linked_task_linked_at timestamptz,
  linked_task_closed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.assigned_tasks (
  id text primary key,
  title text not null default '',
  description text not null default '',
  assigned_by text not null default '',
  assigned_to text not null default '',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'done', 'cancelled')),
  due_date text not null default '',
  project_key text not null default '',
  source_type text not null default 'manual' check (source_type in ('manual', 'cross_dept_request')),
  source_request_id text references public.cross_dept_requests(id) on delete set null,
  source_request_from_dept text,
  source_request_to_dept text,
  notified_done boolean not null default false,
  shared_with text[] not null default '{}',
  shared_responses jsonb not null default '{}'::jsonb,
  accepted_at timestamptz,
  done_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_cross_dept_requests_to_dept_status
  on public.cross_dept_requests(to_dept, status, archived, created_at desc);

create index if not exists idx_cross_dept_requests_created_by
  on public.cross_dept_requests(created_by, archived, updated_at desc);

create index if not exists idx_cross_dept_requests_project_key
  on public.cross_dept_requests(project_key, created_at desc);

create index if not exists idx_assigned_tasks_assigned_to_status
  on public.assigned_tasks(assigned_to, status, created_at desc);

create index if not exists idx_assigned_tasks_assigned_by_status
  on public.assigned_tasks(assigned_by, status, created_at desc);

create index if not exists idx_assigned_tasks_project_key
  on public.assigned_tasks(project_key, created_at desc);

create index if not exists idx_assigned_tasks_source_request
  on public.assigned_tasks(source_request_id);

create index if not exists idx_assigned_tasks_shared_with
  on public.assigned_tasks using gin (shared_with);

drop trigger if exists trg_cross_dept_requests_updated_at on public.cross_dept_requests;
create trigger trg_cross_dept_requests_updated_at
before update on public.cross_dept_requests
for each row
execute function public.set_updated_at();

drop trigger if exists trg_assigned_tasks_updated_at on public.assigned_tasks;
create trigger trg_assigned_tasks_updated_at
before update on public.assigned_tasks
for each row
execute function public.set_updated_at();

-- タスクコメント
create table if not exists public.task_comments (
  id text primary key default gen_random_uuid()::text,
  task_id text not null references public.assigned_tasks(id) on delete cascade,
  username text not null,
  body text not null default '',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_task_comments_task_id
  on public.task_comments(task_id, created_at asc);

-- 部門間依頼コメント
create table if not exists public.request_comments (
  id text primary key default gen_random_uuid()::text,
  request_id text not null references public.cross_dept_requests(id) on delete cascade,
  username text not null,
  body text not null default '',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_request_comments_request_id
  on public.request_comments(request_id, created_at asc);

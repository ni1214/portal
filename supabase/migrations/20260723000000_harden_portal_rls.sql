-- Portal security boundary for Vercel + Supabase Auth.
-- All browser access must use a Supabase user JWT. Server-only RPCs are
-- callable only with the service_role key held by Vercel Functions.

begin;

create schema if not exists private;

alter table public.user_accounts
  add column if not exists is_admin boolean not null default false,
  add column if not exists is_active boolean not null default true,
  add column if not exists access_department text not null default '';

-- Existing accounts remain active, while future self-registration is pending
-- until it is approved through the server-side administration path.
alter table public.user_accounts
  alter column is_active set default false;

-- Freeze the current profile department as the initial authorization claim.
-- The profile value remains user-editable display data; access_department is
-- deliberately omitted from every browser grant below.
update public.user_accounts as account
set access_department = profile.department
from public.user_profiles as profile
where profile.username = account.username
  and nullif(btrim(account.access_department), '') is null
  and nullif(btrim(profile.department), '') is not null;

alter table public.orders
  add column if not exists email_send_status text not null default 'pending',
  add column if not exists attempt_id text,
  add column if not exists started_at timestamptz,
  add column if not exists email_resolution text,
  add column if not exists email_resolution_by text,
  add column if not exists email_resolved_at timestamptz;

update public.orders
set email_send_status = case when email_sent then 'sent' else 'pending' end
where email_send_status is null
   or (email_sent and email_send_status <> 'sent');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_email_send_status_check'
  ) then
    alter table public.orders
      add constraint orders_email_send_status_check
      check (email_send_status in ('pending', 'sending', 'sent', 'failed'));
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_email_resolution_check'
  ) then
    alter table public.orders
      add constraint orders_email_resolution_check
      check (email_resolution is null or email_resolution in ('sent', 'not_sent'));
  end if;
end;
$$;

create unique index if not exists idx_orders_email_attempt_id
  on public.orders(attempt_id)
  where attempt_id is not null;

create index if not exists idx_user_accounts_active_directory
  on public.user_accounts(username)
  where is_active;

-- Administrator membership must be reviewed and provisioned explicitly.
-- A legacy feature-level viewer list is not an authorization source.

-- These values have previously been returned to browsers. Remove the storage
-- locations entirely during cutover and rotate the values into Vercel secrets.
alter table public.portal_config
  drop column if exists gemini_api_key,
  drop column if exists gas_order_url,
  drop column if exists pin_hash;

-- A linked Google identity is not enough: the current session itself must be
-- an OAuth session. This prevents a password/OTP session added to the same
-- Supabase user from inheriting Portal access.
create or replace function private.is_google_company_jwt()
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and lower(coalesce((select auth.jwt() ->> 'email'), ''))
      ~ '^[^@[:space:]]+@framex\.co\.jp$'
    and lower(coalesce(
      (select auth.jwt() -> 'app_metadata' ->> 'provider'),
      ''
    )) = 'google'
    and exists (
      select 1
      from jsonb_array_elements(
        coalesce((select auth.jwt() -> 'amr'), '[]'::jsonb)
      ) as method
      where lower(coalesce(method ->> 'method', '')) = 'oauth'
    )
$$;

create or replace function private.current_username()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select account.username
  from public.user_accounts as account
  where (select private.is_google_company_jwt())
    and account.google_auth_id = (select auth.uid())::text
    and lower(account.google_email) = lower(
      coalesce((select auth.jwt() ->> 'email'), '')
    )
    and lower(account.google_email) ~ '^[^@[:space:]]+@framex\.co\.jp$'
    and account.is_active
  limit 1
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select account.is_admin
    from public.user_accounts as account
    where (select private.is_google_company_jwt())
      and account.google_auth_id = (select auth.uid())::text
      and lower(account.google_email) = lower(
        coalesce((select auth.jwt() ->> 'email'), '')
      )
      and lower(account.google_email) ~ '^[^@[:space:]]+@framex\.co\.jp$'
      and account.is_active
    limit 1
  ), false)
$$;

create or replace function private.current_department()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select account.access_department
  from public.user_accounts as account
  where account.username = (select private.current_username())
    and nullif(btrim(account.access_department), '') is not null
  limit 1
$$;

create or replace function private.username_for_user_id(
  p_user_id uuid,
  p_user_email text
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select account.username
  from public.user_accounts as account
  where account.google_auth_id = p_user_id::text
    and lower(account.google_email) = lower(btrim(coalesce(p_user_email, '')))
    and lower(account.google_email) ~ '^[^@[:space:]]+@framex\.co\.jp$'
    and lower(btrim(coalesce(p_user_email, '')))
      ~ '^[^@[:space:]]+@framex\.co\.jp$'
    and account.is_active
    and exists (
      select 1
      from auth.users as auth_user
      where auth_user.id = p_user_id
        and lower(coalesce(auth_user.email, ''))
          = lower(btrim(coalesce(p_user_email, '')))
        and exists (
          select 1
          from auth.identities as identity
          where identity.user_id = auth_user.id
            and lower(identity.provider) = 'google'
        )
    )
  limit 1
$$;

create or replace function private.is_admin_user(
  p_user_id uuid,
  p_user_email text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select account.is_admin
    from public.user_accounts as account
    where account.google_auth_id = p_user_id::text
      and lower(account.google_email) = lower(btrim(coalesce(p_user_email, '')))
      and lower(account.google_email) ~ '^[^@[:space:]]+@framex\.co\.jp$'
      and lower(btrim(coalesce(p_user_email, '')))
        ~ '^[^@[:space:]]+@framex\.co\.jp$'
      and account.is_active
      and exists (
        select 1
        from auth.users as auth_user
        where auth_user.id = p_user_id
          and lower(coalesce(auth_user.email, ''))
            = lower(btrim(coalesce(p_user_email, '')))
          and exists (
            select 1
            from auth.identities as identity
            where identity.user_id = auth_user.id
              and lower(identity.provider) = 'google'
          )
      )
    limit 1
  ), false)
$$;

create or replace function private.can_view_suggestions()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then false
    when (select private.is_admin()) then true
    else exists (
      select 1
      from public.portal_config as config
      where config.id = 1
        and (select private.current_username()) = any(
          coalesce(config.suggestion_box_viewers, '{}'::text[])
        )
    )
  end
$$;

create or replace function private.get_portal_client_config()
returns table (
  id integer,
  departments text[],
  suggestion_box_viewers text[],
  mission_text text,
  order_seed_version integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    config.id,
    coalesce(config.departments, '{}'::text[]),
    case
      when (select private.is_admin()) then
        coalesce(config.suggestion_box_viewers, '{}'::text[])
      when (select private.can_view_suggestions())
        and (select private.current_username()) is not null then
        array[(select private.current_username())]::text[]
      else '{}'::text[]
    end,
    coalesce(config.mission_text, ''),
    coalesce(config.order_seed_version, 0)
  from public.portal_config as config
  where config.id = 1
    and (select private.current_username()) is not null
$$;

create or replace function private.can_place_private_card(
  p_username text,
  p_section_id text,
  p_parent_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and p_username = (select private.current_username())
    and exists (
      select 1
      from public.private_sections as section
      where section.id = p_section_id
        and section.username = p_username
    )
    and (
      p_parent_id is null
      or exists (
        select 1
        from public.private_cards as parent
        where parent.id = p_parent_id
          and parent.username = p_username
          and parent.section_id = p_section_id
      )
    )
$$;

create or replace function private.guard_user_account_security()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid text := (select auth.uid())::text;
  v_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  v_username text := (select private.current_username());
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
begin
  if v_role = 'service_role' then
    return new;
  end if;

  if v_uid = '' or v_uid is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if not (select private.is_google_company_jwt()) then
    raise exception 'A Google OAuth company session is required'
      using errcode = '42501';
  end if;

  -- The browser has no UPDATE grant for is_active. This narrow branch is
  -- reached only through the administrator RPC below and never permits
  -- self-deactivation, administrator removal, or any concurrent field change.
  if old.is_active
     and not new.is_active
     and not old.is_admin
     and old.username <> v_username
     and (select private.is_admin())
     and (
       to_jsonb(new) - 'is_active'
     ) = (
       to_jsonb(old) - 'is_active'
     ) then
    return new;
  end if;

  if new.username is distinct from old.username
     or new.is_admin is distinct from old.is_admin
     or new.is_active is distinct from old.is_active
     or new.access_department is distinct from old.access_department then
    raise exception 'Protected account fields cannot be changed' using errcode = '42501';
  end if;

  if new.google_auth_id is distinct from old.google_auth_id then
    if old.google_auth_id is not null
       or new.google_auth_id <> v_uid
       or v_email = ''
       or v_email !~ '^[^@[:space:]]+@framex\.co\.jp$'
       or lower(coalesce(new.google_email, '')) <> v_email
       or lower(coalesce(old.google_email, '')) <> v_email then
      raise exception 'Google account link is not permitted' using errcode = '42501';
    end if;
  end if;

  if new.google_auth_id <> v_uid
     or lower(coalesce(new.google_email, '')) <> v_email
     or v_email !~ '^[^@[:space:]]+@framex\.co\.jp$' then
    raise exception 'Account identity does not match the authenticated user'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_user_account_security on public.user_accounts;
create trigger trg_guard_user_account_security
before update on public.user_accounts
for each row execute function private.guard_user_account_security();

create or replace function private.guard_public_card_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := (select private.current_username());
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
begin
  if v_role = 'service_role' then
    return new;
  end if;

  if v_username is null then
    raise exception 'Active portal membership is required' using errcode = '42501';
  end if;

  new.updated_by := v_username;
  return new;
end;
$$;

drop trigger if exists trg_guard_public_card_actor on public.public_cards;
create trigger trg_guard_public_card_actor
before insert or update on public.public_cards
for each row execute function private.guard_public_card_actor();

create or replace function private.guard_attendance_site_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := (select private.current_username());
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
begin
  if v_role = 'service_role' then
    return new;
  end if;

  if v_username is null then
    raise exception 'Active portal membership is required' using errcode = '42501';
  end if;

  if nullif(btrim(new.id), '') is null
     or nullif(btrim(new.code), '') is null
     or nullif(btrim(new.name), '') is null then
    raise exception 'Site id, code, and name are required' using errcode = '22023';
  end if;

  new.updated_by := v_username;
  return new;
end;
$$;

drop trigger if exists trg_guard_attendance_site_actor on public.attendance_sites;
create trigger trg_guard_attendance_site_actor
before insert or update on public.attendance_sites
for each row execute function private.guard_attendance_site_actor();

create or replace function private.guard_assigned_task_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := (select private.current_username());
  v_member text;
  v_delete_context text := current_setting(
    'portal.request_task_delete_context',
    true
  );
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
begin
  if v_role = 'service_role' then
    return new;
  end if;

  if v_username is null then
    raise exception 'Active portal membership is required' using errcode = '42501';
  end if;

  if length(coalesce(new.title, '')) > 300
     or length(coalesce(new.description, '')) > 10000
     or length(coalesce(new.project_key, '')) > 100 then
    raise exception 'Task content is too long' using errcode = '22001';
  end if;

  if tg_op = 'INSERT' then
    new.assigned_by := v_username;
    new.status := 'pending';
    new.notified_done := false;
    new.accepted_at := null;
    new.done_at := null;
    new.shared_with := array(
      select distinct btrim(member)
      from unnest(coalesce(new.shared_with, '{}'::text[])) as member
      where nullif(btrim(member), '') is not null
        and btrim(member) <> v_username
      order by btrim(member)
    );

    if nullif(btrim(coalesce(new.assigned_to, '')), '') is null
       or not exists (
         select 1
         from public.user_accounts as account
         where account.username = new.assigned_to
           and account.is_active
       ) then
      raise exception 'The assignee is not an active Portal member'
        using errcode = '22023';
    end if;
    if cardinality(new.shared_with) > 50
       or exists (
         select 1
         from unnest(new.shared_with) as member
         where not exists (
           select 1
           from public.user_accounts as account
           where account.username = member
             and account.is_active
         )
       ) then
      raise exception 'The shared-user list is invalid' using errcode = '22023';
    end if;

    select coalesce(
      jsonb_object_agg(member, to_jsonb('pending'::text)),
      '{}'::jsonb
    )
    into new.shared_responses
    from unnest(new.shared_with) as member;
    return new;
  end if;

  if v_delete_context = jsonb_build_array(
       'detach-task', old.source_request_id, old.id
     )::text
     and old.source_type = 'cross_dept_request'
     and new.source_type = 'manual'
     and new.source_request_id is null
     and new.source_request_from_dept is null
     and new.source_request_to_dept is null
     and (
       to_jsonb(new) - array[
         'source_type', 'source_request_id', 'source_request_from_dept',
         'source_request_to_dept', 'updated_at'
       ]::text[]
     ) = (
       to_jsonb(old) - array[
         'source_type', 'source_request_id', 'source_request_from_dept',
         'source_request_to_dept', 'updated_at'
       ]::text[]
     ) then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.assigned_by is distinct from old.assigned_by
     or new.source_type is distinct from old.source_type
     or new.source_request_id is distinct from old.source_request_id
     or new.source_request_from_dept is distinct from old.source_request_from_dept
     or new.source_request_to_dept is distinct from old.source_request_to_dept
     or new.created_at is distinct from old.created_at then
    raise exception 'Task identity fields cannot be changed' using errcode = '42501';
  end if;

  if (select private.is_admin()) then
    return new;
  end if;

  if old.assigned_by = v_username then
    if nullif(btrim(coalesce(new.assigned_to, '')), '') is null
       or not exists (
         select 1
         from public.user_accounts as account
         where account.username = new.assigned_to
           and account.is_active
       )
       or cardinality(coalesce(new.shared_with, '{}'::text[])) > 50 then
      raise exception 'The task participants are invalid' using errcode = '22023';
    end if;

    -- Existing participants keep their own response. New participants always
    -- start pending, and response keys may not exist outside shared_with.
    foreach v_member in array coalesce(old.shared_with, '{}'::text[]) loop
      if not (v_member = any(coalesce(new.shared_with, '{}'::text[])))
         or (new.shared_responses ->> v_member)
            is distinct from (old.shared_responses ->> v_member) then
        raise exception 'Existing shared responses cannot be changed by the task creator'
          using errcode = '42501';
      end if;
    end loop;

    foreach v_member in array coalesce(new.shared_with, '{}'::text[]) loop
      if not exists (
        select 1
        from public.user_accounts as account
        where account.username = v_member
          and account.is_active
      ) then
        raise exception 'The shared-user list contains an inactive member'
          using errcode = '22023';
      end if;
      if not (v_member = any(coalesce(old.shared_with, '{}'::text[])))
         and (new.shared_responses ->> v_member) is distinct from 'pending' then
        raise exception 'New shared users must start pending'
          using errcode = '42501';
      end if;
    end loop;

    if exists (
      select 1
      from jsonb_object_keys(coalesce(new.shared_responses, '{}'::jsonb)) as response_key
      where not (response_key = any(coalesce(new.shared_with, '{}'::text[])))
    ) then
      raise exception 'Shared response keys must match shared users'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if old.assigned_to = v_username
     and (
       to_jsonb(new) - array['status', 'accepted_at', 'done_at', 'updated_at']::text[]
     ) = (
       to_jsonb(old) - array['status', 'accepted_at', 'done_at', 'updated_at']::text[]
     )
     and (
       (
         old.status = 'pending'
         and new.status = 'accepted'
         and new.accepted_at is not null
         and new.done_at is not distinct from old.done_at
       )
       or (
         old.status = 'accepted'
         and new.status = 'done'
         and new.done_at is not null
         and new.accepted_at is not distinct from old.accepted_at
       )
     ) then
    return new;
  end if;

  if v_username = any(coalesce(old.shared_with, '{}'::text[]))
     and (
       to_jsonb(new) - array['shared_responses', 'updated_at']::text[]
     ) = (
       to_jsonb(old) - array['shared_responses', 'updated_at']::text[]
     )
     and (new.shared_responses - v_username) = (old.shared_responses - v_username)
     and new.shared_responses ? v_username
     and old.shared_responses ->> v_username = 'pending'
     and new.shared_responses ->> v_username in ('accepted', 'declined') then
    return new;
  end if;

  raise exception 'This task update is not permitted for the current role'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_guard_assigned_task_update on public.assigned_tasks;
create trigger trg_guard_assigned_task_update
before insert or update on public.assigned_tasks
for each row execute function private.guard_assigned_task_update();

create or replace function private.guard_cross_dept_request_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := (select private.current_username());
  v_department text := (select private.current_department());
  v_link_context text := current_setting('portal.request_task_link_context', true);
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
begin
  if v_role = 'service_role' then
    return new;
  end if;

  if v_username is null then
    raise exception 'Active portal membership is required' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if nullif(btrim(v_department), '') is null
       or nullif(btrim(new.to_dept), '') is null then
      raise exception 'A registered source and destination department are required'
        using errcode = '22023';
    end if;

    new.created_by := v_username;
    new.from_dept := v_department;
    new.status := 'submitted';
    new.status_note := '';
    new.status_updated_by := '';
    new.archived := false;
    new.notify_creator := false;
    new.linked_task_id := null;
    new.linked_task_status := null;
    new.linked_task_assigned_to := null;
    new.linked_task_linked_by := null;
    new.linked_task_linked_at := null;
    new.linked_task_closed_at := null;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.created_by is distinct from old.created_by
     or new.from_dept is distinct from old.from_dept
     or new.to_dept is distinct from old.to_dept
     or new.created_at is distinct from old.created_at then
    raise exception 'Request identity fields cannot be changed' using errcode = '42501';
  end if;

  if v_link_context = jsonb_build_array(
       'link', new.id, new.linked_task_id
     )::text
     or v_link_context = jsonb_build_array(
       'sync', new.id, coalesce(new.linked_task_id, old.linked_task_id)
     )::text
     or v_link_context = jsonb_build_array(
       'unlink', new.id, old.linked_task_id
     )::text then
    return new;
  end if;

  if new.linked_task_id is distinct from old.linked_task_id
     or new.linked_task_status is distinct from old.linked_task_status
     or new.linked_task_assigned_to is distinct from old.linked_task_assigned_to
     or new.linked_task_linked_by is distinct from old.linked_task_linked_by
     or new.linked_task_linked_at is distinct from old.linked_task_linked_at
     or new.linked_task_closed_at is distinct from old.linked_task_closed_at then
    raise exception 'Linked task fields may only be changed through the task-link RPC'
      using errcode = '42501';
  end if;

  if (select private.is_admin()) then
    return new;
  end if;

  if old.created_by = v_username
     and (
       to_jsonb(new) - array[
         'title', 'project_key', 'content', 'proposal', 'remarks',
         'archived', 'notify_creator', 'updated_at'
       ]::text[]
     ) = (
       to_jsonb(old) - array[
         'title', 'project_key', 'content', 'proposal', 'remarks',
         'archived', 'notify_creator', 'updated_at'
       ]::text[]
     ) then
    return new;
  end if;

  if old.to_dept = v_department
     and (
       to_jsonb(new) - array[
         'status', 'status_note', 'status_updated_by', 'notify_creator',
         'updated_at'
       ]::text[]
     ) = (
       to_jsonb(old) - array[
         'status', 'status_note', 'status_updated_by', 'notify_creator',
         'updated_at'
       ]::text[]
     ) then
    if (new.status is distinct from old.status
        or new.status_note is distinct from old.status_note)
       and new.status_updated_by <> v_username then
      raise exception 'status_updated_by must match the current user'
        using errcode = '42501';
    end if;

    return new;
  end if;

  raise exception 'This request update is not permitted for the current role'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_guard_cross_dept_request_update
on public.cross_dept_requests;
create trigger trg_guard_cross_dept_request_update
before insert or update on public.cross_dept_requests
for each row execute function private.guard_cross_dept_request_update();

create or replace function private.guard_linked_request_task_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := (select private.current_username());
  v_delete_context text := current_setting(
    'portal.request_task_delete_context',
    true
  );
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
begin
  if v_role = 'service_role' then
    return old;
  end if;

  if v_username is null then
    raise exception 'Active portal membership is required' using errcode = '42501';
  end if;

  if tg_table_name = 'cross_dept_requests'
     and nullif(to_jsonb(old) ->> 'linked_task_id', '') is not null then
    raise exception 'Linked request deletion requires the request-task delete RPC'
      using errcode = '42501';
  end if;

  if tg_table_name = 'assigned_tasks'
     and (
       to_jsonb(old) ->> 'source_type' = 'cross_dept_request'
       or nullif(to_jsonb(old) ->> 'source_request_id', '') is not null
     ) then
    if v_delete_context = jsonb_build_array(
         'delete-task',
         to_jsonb(old) ->> 'source_request_id',
         old.id
       )::text then
      return old;
    end if;

    raise exception 'Linked task deletion requires the request-task delete RPC'
      using errcode = '42501';
  end if;

  return old;
end;
$$;

drop trigger if exists trg_guard_linked_request_delete
on public.cross_dept_requests;
create trigger trg_guard_linked_request_delete
before delete on public.cross_dept_requests
for each row execute function private.guard_linked_request_task_delete();

drop trigger if exists trg_guard_linked_task_delete
on public.assigned_tasks;
create trigger trg_guard_linked_task_delete
before delete on public.assigned_tasks
for each row execute function private.guard_linked_request_task_delete();

create or replace function private.sync_chat_room_last_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chat_rooms as room
  set
    last_message = new.text,
    last_at = new.created_at,
    last_sender = new.username
  where room.id = new.room_id;

  return new;
end;
$$;

drop trigger if exists trg_sync_chat_room_last_message
on public.chat_messages;
create trigger trg_sync_chat_room_last_message
after insert on public.chat_messages
for each row execute function private.sync_chat_room_last_message();

create or replace function private.guard_trouble_report_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := (select private.current_username());
  v_department text := (select private.current_department());
  v_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
begin
  if v_role = 'service_role' then
    return new;
  end if;

  if v_username is null then
    raise exception 'Active portal membership is required' using errcode = '42501';
  end if;

  if length(coalesce(new.title, '')) > 300
     or length(coalesce(new.project_key, '')) > 100
     or length(coalesce(new.occurrence_location, '')) > 1000
     or length(coalesce(new.detail, '')) > 10000
     or length(coalesce(new.cause, '')) > 10000
     or length(coalesce(new.corrective_action, '')) > 10000
     or length(coalesce(new.prevention_action, '')) > 10000
     or length(coalesce(new.keywords, '')) > 2000 then
    raise exception 'Trouble report content is too long' using errcode = '22001';
  end if;

  if tg_op = 'INSERT' then
    new.reporter_username := v_username;
    new.reporter_email := v_email;
    new.department := coalesce(nullif(v_department, ''), new.department, '');
    new.status := 'submitted';
    new.assignee := '';
    new.admin_note := '';
    return new;
  end if;

  if new.id is distinct from old.id
     or new.reporter_username is distinct from old.reporter_username
     or new.reporter_email is distinct from old.reporter_email
     or new.created_at is distinct from old.created_at then
    raise exception 'Trouble report identity fields cannot be changed'
      using errcode = '42501';
  end if;

  if (select private.is_admin()) then
    return new;
  end if;

  if old.reporter_username = v_username
     and (
       to_jsonb(new) - array[
         'report_date', 'mistake_type', 'project_key', 'site_id',
         'title', 'occurrence_location', 'detail', 'cause',
         'corrective_action', 'prevention_action', 'keywords', 'updated_at'
       ]::text[]
     ) = (
       to_jsonb(old) - array[
         'report_date', 'mistake_type', 'project_key', 'site_id',
         'title', 'occurrence_location', 'detail', 'cause',
         'corrective_action', 'prevention_action', 'keywords', 'updated_at'
       ]::text[]
     ) then
    return new;
  end if;

  raise exception 'Only an administrator can change workflow fields'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_guard_trouble_report_write
on public.trouble_reports;
create trigger trg_guard_trouble_report_write
before insert or update on public.trouble_reports
for each row execute function private.guard_trouble_report_write();

alter function public.set_updated_at() set search_path = '';

create or replace view public.portal_client_config
with (security_invoker = true)
as
select * from private.get_portal_client_config();

create or replace function public.list_portal_user_directory()
returns table (
  username text,
  google_name text,
  google_avatar_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    account.username,
    coalesce(account.google_name, ''),
    coalesce(account.google_avatar_url, '')
  from public.user_accounts as account
  where (select auth.uid()) is not null
    and (select private.current_username()) is not null
    and account.is_active
    and account.google_auth_id is not null
    and lower(account.google_email) ~ '^[^@[:space:]]+@framex\.co\.jp$'
  order by account.username
$$;

create or replace function public.claim_portal_account(
  p_google_name text default '',
  p_google_avatar_url text default ''
)
returns table (
  username text,
  last_login_at timestamptz,
  google_auth_id text,
  google_email text,
  google_name text,
  google_avatar_url text,
  login_provider text,
  last_google_login_at timestamptz,
  is_admin boolean,
  is_active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid text := (select auth.uid())::text;
  v_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  v_matches integer;
  v_name text := left(btrim(coalesce(p_google_name, '')), 200);
  v_avatar text := btrim(coalesce(p_google_avatar_url, ''));
begin
  if not (select private.is_google_company_jwt()) then
    raise exception 'A Google OAuth company session is required'
      using errcode = '42501';
  end if;

  select count(*)
  into v_matches
  from public.user_accounts as candidate
  where candidate.is_active
    and lower(candidate.google_email) = v_email
    and (
      candidate.google_auth_id is null
      or candidate.google_auth_id = v_uid
    );

  if v_matches = 0 then
    return;
  end if;
  if v_matches <> 1 then
    raise exception 'The company email is mapped to multiple Portal accounts'
      using errcode = '23505';
  end if;

  if length(v_avatar) > 2048 or v_avatar !~ '^https://' then
    v_avatar := '';
  end if;

  return query
  update public.user_accounts as account
  set
    google_auth_id = v_uid,
    google_email = v_email,
    google_name = coalesce(nullif(v_name, ''), account.google_name),
    google_avatar_url = coalesce(nullif(v_avatar, ''), account.google_avatar_url),
    login_provider = 'google',
    last_google_login_at = timezone('utc', now()),
    last_login_at = timezone('utc', now())
  where account.is_active
    and lower(account.google_email) = v_email
    and (
      account.google_auth_id is null
      or account.google_auth_id = v_uid
    )
  returning
    account.username,
    account.last_login_at,
    account.google_auth_id,
    account.google_email,
    account.google_name,
    account.google_avatar_url,
    account.login_provider,
    account.last_google_login_at,
    account.is_admin,
    account.is_active;
end;
$$;

create or replace function public.deactivate_portal_account(p_username text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := (select private.current_username());
begin
  if v_username is null or not (select private.is_admin()) then
    raise exception 'Administrator access is required' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_username, '')), '') is null
     or p_username = v_username then
    raise exception 'This Portal account cannot be deactivated'
      using errcode = '22023';
  end if;

  update public.user_accounts as account
  set is_active = false
  where account.username = p_username
    and account.is_active
    and not account.is_admin;

  return found;
end;
$$;

create or replace function public.admin_reset_lock_pin(p_username text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := (select private.current_username());
  v_target text := btrim(coalesce(p_username, ''));
begin
  if v_username is null or not (select private.is_admin()) then
    raise exception 'Administrator access is required' using errcode = '42501';
  end if;
  if v_target = '' or not exists (
    select 1
    from public.user_accounts as account
    where account.username = v_target
      and account.is_active
  ) then
    raise exception 'An active Portal account is required'
      using errcode = '22023';
  end if;

  insert into public.user_lock_pins as pin (
    username, enabled, hash, auto_lock_minutes
  )
  values (v_target, false, null, 5)
  on conflict (username) do update
  set
    enabled = false,
    hash = null,
    auto_lock_minutes = 5;

  return true;
end;
$$;

create or replace function public.acknowledge_notice(p_notice_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := (select private.current_username());
begin
  if v_username is null or nullif(btrim(p_notice_id), '') is null then
    raise exception 'Active portal membership and notice id are required'
      using errcode = '42501';
  end if;

  update public.notices as notice
  set acknowledged_by = case
    when v_username = any(coalesce(notice.acknowledged_by, '{}'::text[]))
      then notice.acknowledged_by
    else array_append(coalesce(notice.acknowledged_by, '{}'::text[]), v_username)
  end
  where notice.id = p_notice_id;

  return found;
end;
$$;

create or replace function public.sync_request_task_link(
  p_request_id text,
  p_task_id text,
  p_action text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := (select private.current_username());
  v_department text := (select private.current_department());
  v_is_admin boolean := (select private.is_admin());
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_request public.cross_dept_requests%rowtype;
  v_task public.assigned_tasks%rowtype;
  v_now timestamptz := timezone('utc', now());
begin
  if v_username is null then
    raise exception 'Active portal membership is required' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_request_id, '')), '') is null
     or nullif(btrim(coalesce(p_task_id, '')), '') is null
     or v_action not in ('link', 'sync', 'unlink') then
    raise exception 'A valid request, task, and link action are required'
      using errcode = '22023';
  end if;

  select request.*
  into v_request
  from public.cross_dept_requests as request
  where request.id = p_request_id
  for update;
  if not found then
    raise exception 'The linked request was not found' using errcode = '22023';
  end if;

  select task.*
  into v_task
  from public.assigned_tasks as task
  where task.id = p_task_id
  for share;
  if not found then
    raise exception 'The linked task was not found' using errcode = '22023';
  end if;

  if v_task.source_type <> 'cross_dept_request'
     or v_task.source_request_id is distinct from v_request.id
     or v_task.source_request_from_dept is distinct from v_request.from_dept
     or v_task.source_request_to_dept is distinct from v_request.to_dept then
    raise exception 'The task does not belong to this request'
      using errcode = '42501';
  end if;

  if v_action = 'link' then
    if v_task.assigned_by <> v_username
       or (not v_is_admin and v_request.to_dept <> v_department) then
      raise exception 'Only the destination department task creator may link this task'
        using errcode = '42501';
    end if;
    if v_request.archived
       or v_request.status = 'rejected'
       or v_request.linked_task_id is not null
       or v_task.status <> 'pending' then
      raise exception 'This request and task cannot be linked'
        using errcode = '22023';
    end if;

    perform set_config(
      'portal.request_task_link_context',
      jsonb_build_array(v_action, v_request.id, v_task.id)::text,
      true
    );
    update public.cross_dept_requests as request
    set
      status = 'accepted',
      status_updated_by = v_username,
      notify_creator = true,
      linked_task_id = v_task.id,
      linked_task_status = v_task.status,
      linked_task_assigned_to = v_task.assigned_to,
      linked_task_linked_by = v_username,
      linked_task_linked_at = v_now,
      linked_task_closed_at = null,
      updated_at = v_now
    where request.id = v_request.id;
  elsif v_action = 'sync' then
    if v_request.linked_task_id is distinct from v_task.id
       or v_username not in (v_task.assigned_by, v_task.assigned_to) then
      raise exception 'Only a linked task participant may synchronize this task'
        using errcode = '42501';
    end if;

    perform set_config(
      'portal.request_task_link_context',
      jsonb_build_array(v_action, v_request.id, v_task.id)::text,
      true
    );
    update public.cross_dept_requests as request
    set
      notify_creator = true,
      linked_task_status = v_task.status,
      linked_task_assigned_to = v_task.assigned_to,
      linked_task_closed_at = case
        when v_task.status in ('done', 'cancelled') then v_now
        else null
      end,
      updated_at = v_now
    where request.id = v_request.id;
  else
    if v_request.linked_task_id is distinct from v_task.id
       or (not v_is_admin and v_task.assigned_by <> v_username) then
      raise exception 'Only the linked task creator or an administrator may unlink this task'
        using errcode = '42501';
    end if;

    perform set_config(
      'portal.request_task_link_context',
      jsonb_build_array(v_action, v_request.id, v_task.id)::text,
      true
    );
    update public.cross_dept_requests as request
    set
      notify_creator = true,
      linked_task_id = null,
      linked_task_status = case
        when v_task.status = 'done' then 'done'
        else 'cancelled'
      end,
      linked_task_assigned_to = v_task.assigned_to,
      linked_task_closed_at = v_now,
      updated_at = v_now
    where request.id = v_request.id;
  end if;

  perform set_config('portal.request_task_link_context', '', true);
  return true;
end;
$$;

create or replace function public.delete_request_task_entity(
  p_entity_type text,
  p_entity_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := (select private.current_username());
  v_is_admin boolean := (select private.is_admin());
  v_entity_type text := lower(btrim(coalesce(p_entity_type, '')));
  v_entity_id text := btrim(coalesce(p_entity_id, ''));
  v_request_id text;
  v_request public.cross_dept_requests%rowtype;
  v_task public.assigned_tasks%rowtype;
  v_now timestamptz := timezone('utc', now());
begin
  if v_username is null then
    raise exception 'Active portal membership is required' using errcode = '42501';
  end if;
  if v_entity_type not in ('request', 'task')
     or nullif(v_entity_id, '') is null then
    raise exception 'A valid request-task entity is required'
      using errcode = '22023';
  end if;

  if v_entity_type = 'task' then
    select task.source_request_id
    into v_request_id
    from public.assigned_tasks as task
    where task.id = v_entity_id;
    if not found then
      raise exception 'The task was not found' using errcode = '22023';
    end if;

    -- Lock the request before the task in both branches so concurrent deletion
    -- uses one deterministic lock order.
    if v_request_id is not null then
      select request.*
      into v_request
      from public.cross_dept_requests as request
      where request.id = v_request_id
      for update;
    end if;

    select task.*
    into v_task
    from public.assigned_tasks as task
    where task.id = v_entity_id
    for update;
    if not found then
      raise exception 'The task was not found' using errcode = '22023';
    end if;
    if not v_is_admin and v_task.assigned_by <> v_username then
      raise exception 'Only the task creator or an administrator may delete this task'
        using errcode = '42501';
    end if;

    if v_request.id is not null
       and v_request.linked_task_id = v_task.id then
      perform set_config(
        'portal.request_task_link_context',
        jsonb_build_array('unlink', v_request.id, v_task.id)::text,
        true
      );
      update public.cross_dept_requests as request
      set
        notify_creator = true,
        linked_task_id = null,
        linked_task_status = case
          when v_task.status = 'done' then 'done'
          else 'cancelled'
        end,
        linked_task_assigned_to = v_task.assigned_to,
        linked_task_closed_at = v_now,
        updated_at = v_now
      where request.id = v_request.id;
      perform set_config('portal.request_task_link_context', '', true);
    end if;

    perform set_config(
      'portal.request_task_delete_context',
      jsonb_build_array(
        'delete-task',
        v_task.source_request_id,
        v_task.id
      )::text,
      true
    );
    delete from public.assigned_tasks as task
    where task.id = v_task.id;
    perform set_config('portal.request_task_delete_context', '', true);
    return found;
  end if;

  select request.*
  into v_request
  from public.cross_dept_requests as request
  where request.id = v_entity_id
  for update;
  if not found then
    raise exception 'The request was not found' using errcode = '22023';
  end if;
  if not v_is_admin and v_request.created_by <> v_username then
    raise exception 'Only the request creator or an administrator may delete this request'
      using errcode = '42501';
  end if;

  if v_request.linked_task_id is not null then
    select task.*
    into v_task
    from public.assigned_tasks as task
    where task.id = v_request.linked_task_id
    for update;

    if v_task.id is not null then
      perform set_config(
        'portal.request_task_delete_context',
        jsonb_build_array('detach-task', v_request.id, v_task.id)::text,
        true
      );
      update public.assigned_tasks as task
      set
        source_type = 'manual',
        source_request_id = null,
        source_request_from_dept = null,
        source_request_to_dept = null,
        updated_at = v_now
      where task.id = v_task.id;
      perform set_config('portal.request_task_delete_context', '', true);
    end if;

    perform set_config(
      'portal.request_task_link_context',
      jsonb_build_array(
        'unlink',
        v_request.id,
        coalesce(v_task.id, v_request.linked_task_id)
      )::text,
      true
    );
    update public.cross_dept_requests as request
    set
      notify_creator = true,
      linked_task_id = null,
      linked_task_status = case
        when v_task.status = 'done' then 'done'
        else 'cancelled'
      end,
      linked_task_assigned_to = coalesce(
        v_task.assigned_to,
        v_request.linked_task_assigned_to
      ),
      linked_task_closed_at = v_now,
      updated_at = v_now
    where request.id = v_request.id;
    perform set_config('portal.request_task_link_context', '', true);
  end if;

  delete from public.cross_dept_requests as request
  where request.id = v_request.id;
  return found;
end;
$$;

create or replace function public.set_public_attendance(
  p_year_month text,
  p_day text,
  p_type text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := (select private.current_username());
  v_date date;
  v_day_value jsonb;
begin
  if v_username is null then
    raise exception 'Active portal membership is required' using errcode = '42501';
  end if;

  if coalesce(p_year_month, '') !~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$'
     or coalesce(p_day, '') !~ '^(0[1-9]|[12][0-9]|3[01])$' then
    raise exception 'Invalid attendance date' using errcode = '22007';
  end if;

  begin
    v_date := (p_year_month || '-' || p_day)::date;
  exception when datetime_field_overflow then
    raise exception 'Invalid attendance date' using errcode = '22007';
  end;

  if to_char(v_date, 'YYYY-MM') <> p_year_month
     or to_char(v_date, 'DD') <> p_day then
    raise exception 'Invalid attendance date' using errcode = '22007';
  end if;

  if p_type is not null
     and p_type not in ('有給', '半休午前', '半休午後', '欠勤') then
    raise exception 'Invalid attendance type' using errcode = '22023';
  end if;

  if p_type is null then
    select case
      when jsonb_typeof(month.days -> p_day) = 'object'
        then (month.days -> p_day) - v_username
      else '{}'::jsonb
    end
    into v_day_value
    from public.public_attendance_months as month
    where month.year_month = p_year_month
    for update;

    if not found then
      return false;
    end if;

    update public.public_attendance_months as month
    set days = case
      when v_day_value = '{}'::jsonb then month.days - p_day
      else jsonb_set(month.days, array[p_day], v_day_value, false)
    end
    where month.year_month = p_year_month;

    return true;
  end if;

  insert into public.public_attendance_months as month (year_month, days)
  values (
    p_year_month,
    jsonb_build_object(p_day, jsonb_build_object(v_username, p_type))
  )
  on conflict (year_month) do update
  set days = jsonb_set(
    coalesce(month.days, '{}'::jsonb),
    array[p_day],
    case
      when jsonb_typeof(month.days -> p_day) = 'object'
        then (month.days -> p_day) || jsonb_build_object(v_username, p_type)
      else jsonb_build_object(v_username, p_type)
    end,
    true
  );

  return true;
end;
$$;

create or replace function public.list_trouble_reports(
  p_status text default 'open',
  p_search text default '',
  p_project_key text default ''
)
returns table (
  id text,
  report_date date,
  reporter_username text,
  reporter_email text,
  department text,
  mistake_type text,
  project_key text,
  site_id text,
  title text,
  occurrence_location text,
  detail text,
  cause text,
  corrective_action text,
  prevention_action text,
  keywords text,
  status text,
  assignee text,
  admin_note text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_username text := (select private.current_username());
  v_is_admin boolean := (select private.is_admin());
  v_status text := lower(btrim(coalesce(p_status, 'open')));
  v_search text := left(btrim(coalesce(p_search, '')), 200);
  v_project_key text := left(btrim(coalesce(p_project_key, '')), 100);
begin
  if v_username is null then
    raise exception 'Active portal membership is required' using errcode = '42501';
  end if;
  if v_status not in ('open', 'all', 'submitted', 'reviewing', 'done', 'archived') then
    raise exception 'Invalid trouble report status' using errcode = '22023';
  end if;

  return query
  select
    report.id,
    report.report_date,
    report.reporter_username,
    case
      when v_is_admin or report.reporter_username = v_username
        then report.reporter_email
      else ''
    end,
    report.department,
    report.mistake_type,
    report.project_key,
    report.site_id,
    report.title,
    report.occurrence_location,
    report.detail,
    report.cause,
    report.corrective_action,
    report.prevention_action,
    report.keywords,
    report.status,
    report.assignee,
    case when v_is_admin then report.admin_note else '' end,
    report.created_at,
    report.updated_at
  from public.trouble_reports as report
  where (
      v_status = 'all'
      or (v_status = 'open' and report.status in ('submitted', 'reviewing'))
      or report.status = v_status
    )
    and (
      v_search = ''
      or report.title ilike ('%' || v_search || '%')
      or report.project_key ilike ('%' || v_search || '%')
    )
    and (v_project_key = '' or report.project_key = v_project_key)
  order by report.created_at desc
  limit 200;
end;
$$;

-- The cross-user work summary intentionally exposes only project allocation.
-- Leave type, early/late hours and notes remain visible only to the owner.
create or replace function public.list_attendance_work_summary(
  p_year_months text[]
)
returns table (
  username text,
  entry_date date,
  type text,
  hayade text,
  zangyo text,
  note text,
  work_site_hours jsonb,
  project_keys text[],
  year_month text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_username text := (select private.current_username());
  v_months text[] := coalesce(p_year_months, '{}'::text[]);
begin
  if v_username is null then
    raise exception 'Active portal membership is required' using errcode = '42501';
  end if;
  if cardinality(v_months) < 1
     or cardinality(v_months) > 6
     or exists (
       select 1
       from unnest(v_months) as month_value
       where month_value !~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$'
     ) then
    raise exception 'Invalid attendance summary period' using errcode = '22023';
  end if;

  return query
  select
    entry.username,
    entry.entry_date,
    case when entry.username = v_username then entry.type else null end,
    case when entry.username = v_username then entry.hayade else null end,
    case when entry.username = v_username then entry.zangyo else null end,
    case when entry.username = v_username then entry.note else null end,
    entry.work_site_hours,
    entry.project_keys,
    entry.year_month,
    entry.updated_at
  from public.attendance_entries as entry
  where entry.year_month = any(v_months)
  order by entry.entry_date asc
  limit 5000;
end;
$$;

-- Private atomic rate-limit state. It is never exposed through the Data API.
create table if not exists private.portal_rate_limits (
  user_id uuid not null,
  feature text not null,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, feature)
);

drop function if exists public.consume_portal_rate_limit(text, integer, integer);
drop function if exists public.consume_portal_rate_limit(
  uuid, text, integer, integer
);

create or replace function public.consume_portal_rate_limit(
  p_user_id uuid,
  p_user_email text,
  p_feature text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_feature text := lower(btrim(coalesce(p_feature, '')));
  v_effective_limit integer;
  v_effective_window integer;
  v_allowed boolean := false;
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
begin
  if v_role <> 'service_role' then
    raise exception 'Service role is required' using errcode = '42501';
  end if;

  if p_user_id is null
     or (select private.username_for_user_id(p_user_id, p_user_email)) is null then
    raise exception 'Active portal member was not found' using errcode = '42501';
  end if;

  if v_feature in ('ai:email', 'ai:shared-link', 'ai:trouble-report') then
    v_effective_limit := least(greatest(coalesce(p_limit, 20), 1), 20);
    v_effective_window := 3600;
  elsif v_feature = 'order-email' then
    v_effective_limit := least(greatest(coalesce(p_limit, 20), 1), 20);
    v_effective_window := 3600;
  elsif v_feature = 'weather' then
    v_effective_limit := least(greatest(coalesce(p_limit, 120), 1), 120);
    v_effective_window := 3600;
  else
    raise exception 'Unsupported rate-limit feature' using errcode = '22023';
  end if;

  -- The caller-provided window can only make the rule stricter, never weaker.
  if p_window_seconds is not null and p_window_seconds > 3600 then
    v_effective_window := least(p_window_seconds, 86400);
  end if;

  insert into private.portal_rate_limits as limits (
    user_id,
    feature,
    window_started_at,
    request_count,
    updated_at
  ) values (
    p_user_id,
    v_feature,
    timezone('utc', now()),
    1,
    timezone('utc', now())
  )
  on conflict (user_id, feature) do update
  set
    window_started_at = case
      when limits.window_started_at
        <= timezone('utc', now()) - make_interval(secs => v_effective_window)
      then timezone('utc', now())
      else limits.window_started_at
    end,
    request_count = case
      when limits.window_started_at
        <= timezone('utc', now()) - make_interval(secs => v_effective_window)
      then 1
      else limits.request_count + 1
    end,
    updated_at = timezone('utc', now())
  where limits.window_started_at
          <= timezone('utc', now()) - make_interval(secs => v_effective_window)
     or limits.request_count < v_effective_limit
  returning true into v_allowed;

  return coalesce(v_allowed, false);
end;
$$;

drop function if exists public.claim_order_email_send(text);
drop function if exists public.claim_order_email_send(uuid, text);

create or replace function public.claim_order_email_send(
  p_user_id uuid,
  p_user_email text,
  p_order_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text;
  v_is_admin boolean;
  v_attempt_id text;
  v_order_json jsonb;
  v_status text;
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
begin
  if v_role <> 'service_role' then
    raise exception 'Service role is required' using errcode = '42501';
  end if;

  v_username := (
    select private.username_for_user_id(p_user_id, p_user_email)
  );
  v_is_admin := (
    select private.is_admin_user(p_user_id, p_user_email)
  );
  if p_user_id is null or v_username is null then
    raise exception 'Active portal member was not found' using errcode = '42501';
  end if;

  v_attempt_id := p_user_id::text || ':' || gen_random_uuid()::text;

  update public.orders as target
  set
    supplier_name = supplier.name,
    supplier_email = supplier.email,
    email_send_status = 'sending',
    attempt_id = v_attempt_id,
    started_at = timezone('utc', now()),
    email_resolution = null,
    email_resolution_by = null,
    email_resolved_at = null
  from public.order_suppliers as supplier
  where target.id = p_order_id
    and (target.ordered_by = v_username or v_is_admin)
    and target.supplier_id = supplier.id
    and supplier.active
    and nullif(btrim(supplier.email), '') is not null
    and supplier.email !~ E'[\\r\\n]'
    and not target.email_sent
    -- A stale "sending" row may mean Gmail accepted the message while the
    -- response was lost. Never reclaim it automatically: an administrator
    -- must verify the mailbox before permitting another attempt.
    and target.email_send_status in ('pending', 'failed')
  returning jsonb_build_object(
    'id', target.id,
    'supplier_id', supplier.id,
    'supplier_name', supplier.name,
    'supplier_email', supplier.email,
    'order_type', target.order_type,
    'site_name', target.site_name,
    'project_key', target.project_key,
    'items', target.items,
    'ordered_by', target.ordered_by,
    'note', target.note,
    'ordered_at', target.ordered_at
  ) into v_order_json;

  if found then
    return jsonb_build_object(
      'claimed', true,
      'attempt_id', v_attempt_id,
      'status', 'sending',
      'order', v_order_json
    );
  end if;

  select case
    when target.email_sent or target.email_send_status = 'sent' then 'already_sent'
    when target.email_send_status = 'sending' then 'sending'
    else 'not_found'
  end
  into v_status
  from public.orders as target
  where target.id = p_order_id
    and (target.ordered_by = v_username or v_is_admin);

  return jsonb_build_object(
    'claimed', false,
    'status', coalesce(v_status, 'not_found')
  );
end;
$$;

drop function if exists public.finish_order_email_send(text, text, boolean);
drop function if exists public.finish_order_email_send(
  uuid, text, text, boolean
);

create or replace function public.finish_order_email_send(
  p_user_id uuid,
  p_user_email text,
  p_order_id text,
  p_attempt_id text,
  p_success boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text;
  v_is_admin boolean;
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
begin
  if v_role <> 'service_role' then
    raise exception 'Service role is required' using errcode = '42501';
  end if;

  v_username := (
    select private.username_for_user_id(p_user_id, p_user_email)
  );
  v_is_admin := (
    select private.is_admin_user(p_user_id, p_user_email)
  );
  if p_user_id is null or v_username is null then
    raise exception 'Active portal member was not found' using errcode = '42501';
  end if;

  if nullif(p_attempt_id, '') is null
     or split_part(p_attempt_id, ':', 1) <> p_user_id::text then
    return false;
  end if;

  update public.orders as target
  set
    email_send_status = case when p_success then 'sent' else 'failed' end,
    email_sent = p_success,
    email_sent_at = case
      when p_success then coalesce(target.email_sent_at, timezone('utc', now()))
      else null
    end,
    started_at = null
  where target.id = p_order_id
    and target.attempt_id = p_attempt_id
    and target.email_send_status = 'sending'
    and (target.ordered_by = v_username or v_is_admin);

  if found then
    return true;
  end if;

  -- Repeated completion of the same attempt is considered successful.
  return exists (
    select 1
    from public.orders as target
    where target.id = p_order_id
      and target.attempt_id = p_attempt_id
      and (target.ordered_by = v_username or v_is_admin)
      and (
        (p_success and target.email_send_status = 'sent' and target.email_sent)
        or (
          not p_success
          and target.email_send_status = 'failed'
          and not target.email_sent
        )
      )
  );
end;
$$;

create or replace function public.authorize_order_email_resolution(
  p_user_id uuid,
  p_user_email text,
  p_order_id text,
  p_attempt_id text,
  p_resolution text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text;
  v_resolution text := lower(btrim(coalesce(p_resolution, '')));
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
begin
  if v_role <> 'service_role' then
    raise exception 'Service role is required' using errcode = '42501';
  end if;

  v_username := (
    select private.username_for_user_id(p_user_id, p_user_email)
  );
  if v_username is null
     or not (select private.is_admin_user(p_user_id, p_user_email)) then
    raise exception 'Administrator access is required' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_order_id, '')), '') is null
     or nullif(btrim(coalesce(p_attempt_id, '')), '') is null
     or v_resolution not in ('sent', 'not_sent') then
    raise exception 'Order, attempt, and resolution are required'
      using errcode = '22023';
  end if;

  -- This is intentionally read-only. Vercel must prove authorization and the
  -- exact current attempt before it is allowed to reconcile GAS state.
  return exists (
    select 1
    from public.orders as target
    where target.id = p_order_id
      and target.attempt_id = p_attempt_id
      and (
        (
          target.email_send_status = 'sending'
          and not target.email_sent
        )
        or (
          target.email_resolution = v_resolution
          and (
            (
              v_resolution = 'sent'
              and target.email_send_status = 'sent'
              and target.email_sent
            )
            or (
              v_resolution = 'not_sent'
              and target.email_send_status = 'failed'
              and not target.email_sent
            )
          )
        )
      )
  );
end;
$$;

drop function if exists public.resolve_order_email_send(text, text, text);

create or replace function public.resolve_order_email_send(
  p_user_id uuid,
  p_user_email text,
  p_order_id text,
  p_attempt_id text,
  p_resolution text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text;
  v_resolution text := lower(btrim(coalesce(p_resolution, '')));
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
begin
  if v_role <> 'service_role' then
    raise exception 'Service role is required' using errcode = '42501';
  end if;

  v_username := (
    select private.username_for_user_id(p_user_id, p_user_email)
  );
  if v_username is null
     or not (select private.is_admin_user(p_user_id, p_user_email)) then
    raise exception 'Administrator access is required' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_order_id, '')), '') is null
     or nullif(btrim(coalesce(p_attempt_id, '')), '') is null
     or v_resolution not in ('sent', 'not_sent') then
    raise exception 'Order, attempt, and resolution are required'
      using errcode = '22023';
  end if;

  update public.orders as target
  set
    email_send_status = case
      when v_resolution = 'sent' then 'sent'
      else 'failed'
    end,
    email_sent = v_resolution = 'sent',
    email_sent_at = case
      when v_resolution = 'sent'
        then coalesce(target.email_sent_at, timezone('utc', now()))
      else null
    end,
    started_at = null,
    email_resolution = v_resolution,
    email_resolution_by = v_username,
    email_resolved_at = timezone('utc', now())
  where target.id = p_order_id
    and target.attempt_id = p_attempt_id
    and target.email_send_status = 'sending'
    and not target.email_sent;

  if found then
    return true;
  end if;

  -- Provider reconciliation and this RPC are a distributed operation. If the
  -- database committed but the Vercel response was lost, the same verified
  -- attempt and resolution can be completed safely without changing state.
  return exists (
    select 1
    from public.orders as target
    where target.id = p_order_id
      and target.attempt_id = p_attempt_id
      and target.email_resolution = v_resolution
      and (
        (
          v_resolution = 'sent'
          and target.email_send_status = 'sent'
          and target.email_sent
        )
        or (
          v_resolution = 'not_sent'
          and target.email_send_status = 'failed'
          and not target.email_sent
        )
      )
  );
end;
$$;

create or replace function public.ensure_dm_room(
  p_room_id text,
  p_other_username text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := (select private.current_username());
  v_other text := btrim(coalesce(p_other_username, ''));
  v_members text[];
  v_saved boolean := false;
begin
  if v_username is null
     or v_other = ''
     or v_other = v_username
     or nullif(btrim(coalesce(p_room_id, '')), '') is null
     or length(p_room_id) > 200
     or p_room_id ~ '[[:cntrl:]]' then
    raise exception 'Invalid direct-message request' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.user_accounts as account
    where account.username = v_other
      and account.is_active
      and account.google_auth_id is not null
      and lower(account.google_email) ~ '^[^@[:space:]]+@framex\.co\.jp$'
  ) then
    raise exception 'The selected Portal member is not active' using errcode = '22023';
  end if;

  select array_agg(member order by member)
  into v_members
  from unnest(array[v_username, v_other]) as member;

  insert into public.chat_rooms as room (
    id, type, name, members, created_by,
    last_message, last_at, last_sender
  )
  values (
    p_room_id, 'dm', '', v_members, v_username,
    '', null, ''
  )
  on conflict (id) do update
  set members = room.members
  where room.type = 'dm'
    -- An existing DM id belongs permanently to the same participant pair.
    -- Never expand a one-member legacy room to a different user because its
    -- historical messages would become visible to that new participant.
    and room.members <@ excluded.members
    and room.members @> excluded.members
    and cardinality(room.members) = cardinality(excluded.members)
    and room.created_by = any(excluded.members)
  returning true into v_saved;

  if not coalesce(v_saved, false) then
    raise exception 'The direct-message room id is already in use'
      using errcode = '23505';
  end if;
  return true;
end;
$$;

create or replace function public.create_group_room(
  p_room_id text,
  p_name text,
  p_members text[]
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := (select private.current_username());
  v_name text := btrim(coalesce(p_name, ''));
  v_members text[];
begin
  if v_username is null
     or nullif(btrim(coalesce(p_room_id, '')), '') is null
     or length(p_room_id) > 200
     or p_room_id ~ '[[:cntrl:]]'
     or v_name = ''
     or length(v_name) > 100 then
    raise exception 'Invalid group-room request' using errcode = '22023';
  end if;

  select array_agg(member order by member)
  into v_members
  from (
    select distinct btrim(value) as member
    from unnest(coalesce(p_members, '{}'::text[]) || array[v_username]) as value
    where nullif(btrim(value), '') is not null
  ) as normalized;

  if cardinality(v_members) < 2 or cardinality(v_members) > 50 then
    raise exception 'A group must have between 2 and 50 members'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(v_members) as member
    where not exists (
      select 1
      from public.user_accounts as account
      where account.username = member
        and account.is_active
        and account.google_auth_id is not null
        and lower(account.google_email) ~ '^[^@[:space:]]+@framex\.co\.jp$'
    )
  ) then
    raise exception 'The group contains an inactive Portal member'
      using errcode = '22023';
  end if;

  insert into public.chat_rooms (
    id, type, name, members, created_by,
    last_message, last_at, last_sender
  )
  values (
    p_room_id, 'group', v_name, v_members, v_username,
    '', null, ''
  );
  return true;
end;
$$;

create or replace function public.leave_chat_room(p_room_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := (select private.current_username());
  v_member_count integer;
  v_room_type text;
begin
  if v_username is null or nullif(btrim(coalesce(p_room_id, '')), '') is null then
    raise exception 'Active membership and a room id are required'
      using errcode = '42501';
  end if;

  select
    cardinality(coalesce(room.members, '{}'::text[])),
    room.type
  into v_member_count, v_room_type
  from public.chat_rooms as room
  where room.id = p_room_id
    and v_username = any(coalesce(room.members, '{}'::text[]))
  for update;

  if not found then
    return false;
  end if;

  -- A DM's history belongs to exactly its original pair. Deleting the room
  -- also deletes all messages through chat_messages.room_id ON DELETE CASCADE,
  -- so the id can never expose an earlier conversation to a replacement user.
  if v_room_type = 'dm' or v_member_count <= 1 then
    delete from public.chat_rooms as room
    where room.id = p_room_id;
  else
    update public.chat_rooms as room
    set members = array_remove(room.members, v_username)
    where room.id = p_room_id;
  end if;
  return true;
end;
$$;

create or replace function public.prune_oldest_chat_message(p_room_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := (select private.current_username());
  v_deleted boolean := false;
begin
  if v_username is null then
    raise exception 'Active portal membership is required' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.chat_rooms as room
    where room.id = p_room_id
      and v_username = any(coalesce(room.members, '{}'::text[]))
  ) then
    raise exception 'Chat room membership is required' using errcode = '42501';
  end if;

  if (
    select count(*)
    from public.chat_messages as message
    where message.room_id = p_room_id
  ) < 200 then
    return false;
  end if;

  delete from public.chat_messages as message
  where message.id = (
    select oldest.id
    from public.chat_messages as oldest
    where oldest.room_id = p_room_id
    order by oldest.created_at asc, oldest.id asc
    limit 1
  )
  returning true into v_deleted;

  return coalesce(v_deleted, false);
end;
$$;

create or replace function private.guard_chat_message_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := (select private.current_username());
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
begin
  if v_role = 'service_role' then
    return new;
  end if;
  if v_username is null then
    raise exception 'Active portal membership is required' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(new.text, '')), '') is null
     or length(new.text) > 10000 then
    raise exception 'Chat message must be between 1 and 10000 characters'
      using errcode = '22023';
  end if;
  new.username := v_username;
  return new;
end;
$$;

drop trigger if exists trg_guard_chat_message_write on public.chat_messages;
create trigger trg_guard_chat_message_write
before insert on public.chat_messages
for each row execute function private.guard_chat_message_write();

create or replace function private.guard_p2p_signal_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := (select private.current_username());
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
begin
  if v_role = 'service_role' then
    return new;
  end if;
  if v_username is null then
    raise exception 'Active portal membership is required' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if nullif(btrim(coalesce(new.id, '')), '') is null
       or length(new.id) > 200
       or nullif(btrim(coalesce(new."to", '')), '') is null
       or new."to" = v_username
       or not exists (
         select 1
         from public.user_accounts as account
         where account.username = new."to"
           and account.is_active
       )
       or length(coalesce(new.file_name, '')) > 255
       or length(coalesce(new.file_type, '')) > 200
       or new.file_size < 0
       or new.file_size > 2147483648
       or nullif(new.offer, '') is null
       or length(new.offer) > 100000 then
      raise exception 'Invalid P2P transfer request' using errcode = '22023';
    end if;
    new."from" := v_username;
    new.status := 'pending';
    new.answer := null;
    new.from_candidates := '{}';
    new.to_candidates := '{}';
    return new;
  end if;

  if new.id is distinct from old.id
     or new."from" is distinct from old."from"
     or new."to" is distinct from old."to"
     or new.file_name is distinct from old.file_name
     or new.file_size is distinct from old.file_size
     or new.file_type is distinct from old.file_type
     or new.offer is distinct from old.offer
     or new.created_at is distinct from old.created_at then
    raise exception 'P2P transfer identity fields cannot be changed'
      using errcode = '42501';
  end if;

  if old."from" = v_username
     and new.answer is not distinct from old.answer
     and new.to_candidates is not distinct from old.to_candidates
     and (
       new.status = old.status
       or (old.status = 'accepted' and new.status = 'done')
     ) then
    return new;
  end if;

  if old."to" = v_username
     and new.from_candidates is not distinct from old.from_candidates
     and (
       new.answer is not distinct from old.answer
       or (
         old.answer is null
         and nullif(new.answer, '') is not null
         and length(new.answer) <= 100000
       )
     )
     and (
       new.status = old.status
       or (old.status = 'pending' and new.status in ('accepted', 'rejected'))
       or (old.status = 'accepted' and new.status = 'done')
     ) then
    return new;
  end if;

  raise exception 'This P2P update is not permitted for the current role'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_guard_p2p_signal_write on public.p2p_signals;
create trigger trg_guard_p2p_signal_write
before insert or update on public.p2p_signals
for each row execute function private.guard_p2p_signal_write();

create or replace function public.append_p2p_candidate(
  p_session_id text,
  p_role text,
  p_candidate text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := (select private.current_username());
begin
  if (select auth.uid()) is null or v_username is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if p_role not in ('from', 'to')
     or nullif(p_candidate, '') is null
     or length(p_candidate) > 4096
     or nullif(btrim(coalesce(p_session_id, '')), '') is null
     or length(p_session_id) > 200 then
    raise exception 'Invalid P2P candidate request' using errcode = '22023';
  end if;

  if p_role = 'from' then
    update public.p2p_signals as signal
    set from_candidates = signal.from_candidates || array[p_candidate]
    where signal.id = p_session_id
      and signal."from" = v_username
      and cardinality(coalesce(signal.from_candidates, '{}'::text[])) < 256;
  else
    update public.p2p_signals as signal
    set to_candidates = signal.to_candidates || array[p_candidate]
    where signal.id = p_session_id
      and signal."to" = v_username
      and cardinality(coalesce(signal.to_candidates, '{}'::text[])) < 256;
  end if;

  if not found then
    raise exception 'P2P session was not found for this user' using errcode = '42501';
  end if;
end;
$$;

-- Remove every previous policy on the managed tables so permissive legacy
-- policies cannot remain alongside the hardened definitions below.
do $$
declare
  policy_row record;
  managed_tables constant text[] := array[
    'assigned_tasks', 'attendance_entries', 'attendance_sites',
    'chat_messages', 'chat_rooms', 'company_calendar_settings',
    'cross_dept_requests', 'drive_shares', 'notice_reactions', 'notices',
    'order_items', 'order_suppliers', 'orders', 'p2p_signals',
    'portal_config', 'private_cards', 'private_sections',
    'public_attendance_months', 'public_cards', 'public_categories',
    'request_comments', 'suggestion_box', 'task_comments', 'trouble_reports',
    'user_accounts', 'user_chat_reads', 'user_drive_contacts',
    'user_drive_links', 'user_email_contacts', 'user_lock_pins',
    'user_notice_reads', 'user_preferences', 'user_profiles',
    'user_section_orders', 'user_todos'
  ];
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any(managed_tables)
  loop
    execute format(
      'drop policy %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
  managed_tables constant text[] := array[
    'assigned_tasks', 'attendance_entries', 'attendance_sites',
    'chat_messages', 'chat_rooms', 'company_calendar_settings',
    'cross_dept_requests', 'drive_shares', 'notice_reactions', 'notices',
    'order_items', 'order_suppliers', 'orders', 'p2p_signals',
    'portal_config', 'private_cards', 'private_sections',
    'public_attendance_months', 'public_cards', 'public_categories',
    'request_comments', 'suggestion_box', 'task_comments', 'trouble_reports',
    'user_accounts', 'user_chat_reads', 'user_drive_contacts',
    'user_drive_links', 'user_email_contacts', 'user_lock_pins',
    'user_notice_reads', 'user_preferences', 'user_profiles',
    'user_section_orders', 'user_todos'
  ];
begin
  foreach table_name in array managed_tables loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end;
$$;

-- Singleton configuration: direct access is admin-only.
create policy portal_config_admin_select
on public.portal_config for select to authenticated
using ((select private.is_admin()));

create policy portal_config_admin_update
on public.portal_config for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()) and id = 1);

-- Accounts must be provisioned ahead of time. Browser access may only link an
-- already-active row whose stored corporate email matches the live JWT.
create policy user_accounts_self_or_admin_select
on public.user_accounts for select to authenticated
using (
  (select private.is_admin())
  or username = (select private.current_username())
);

create policy user_accounts_self_or_admin_update
on public.user_accounts for update to authenticated
using (
  (select private.is_admin())
  or username = (select private.current_username())
)
with check (
  (select private.is_admin())
  or (
    google_auth_id = (select auth.uid())::text
    and lower(google_email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
    and lower(google_email) ~ '^[^@[:space:]]+@framex\.co\.jp$'
    and is_active
  )
);

create policy user_profiles_self_or_admin_select
on public.user_profiles for select to authenticated
using (username = (select private.current_username()) or (select private.is_admin()));
create policy user_profiles_self_or_admin_insert
on public.user_profiles for insert to authenticated
with check (username = (select private.current_username()) or (select private.is_admin()));
create policy user_profiles_self_or_admin_update
on public.user_profiles for update to authenticated
using (username = (select private.current_username()) or (select private.is_admin()))
with check (username = (select private.current_username()) or (select private.is_admin()));
create policy user_profiles_self_or_admin_delete
on public.user_profiles for delete to authenticated
using (username = (select private.current_username()) or (select private.is_admin()));

-- Username-owned private tables.
do $$
declare
  table_name text;
  owner_tables constant text[] := array[
    'user_preferences', 'user_lock_pins', 'user_section_orders',
    'user_chat_reads', 'user_drive_links', 'user_drive_contacts',
    'private_sections', 'user_todos', 'attendance_entries',
    'user_email_contacts', 'user_notice_reads'
  ];
begin
  foreach table_name in array owner_tables loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (username = (select private.current_username()))',
      table_name || '_owner_select', table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (username = (select private.current_username()))',
      table_name || '_owner_insert', table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (username = (select private.current_username())) with check (username = (select private.current_username()))',
      table_name || '_owner_update', table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (username = (select private.current_username()))',
      table_name || '_owner_delete', table_name
    );
  end loop;
end;
$$;

create policy private_cards_owner_select
on public.private_cards for select to authenticated
using (username = (select private.current_username()));
create policy private_cards_owner_insert
on public.private_cards for insert to authenticated
with check (
  (select private.can_place_private_card(username, section_id, parent_id))
);
create policy private_cards_owner_update
on public.private_cards for update to authenticated
using (username = (select private.current_username()))
with check (
  (select private.can_place_private_card(username, section_id, parent_id))
);
create policy private_cards_owner_delete
on public.private_cards for delete to authenticated
using (username = (select private.current_username()));

-- Shared directory/reference data: active Portal members only.
create policy public_categories_authenticated_select
on public.public_categories for select to authenticated
using ((select private.current_username()) is not null);
create policy public_categories_member_insert
on public.public_categories for insert to authenticated
with check ((select private.current_username()) is not null);
create policy public_categories_member_update
on public.public_categories for update to authenticated
using ((select private.current_username()) is not null)
with check ((select private.current_username()) is not null);
create policy public_categories_member_delete
on public.public_categories for delete to authenticated
using ((select private.current_username()) is not null);

create policy public_cards_authenticated_select
on public.public_cards for select to authenticated
using ((select private.current_username()) is not null);
create policy public_cards_member_insert
on public.public_cards for insert to authenticated
with check ((select private.current_username()) is not null);
create policy public_cards_member_update
on public.public_cards for update to authenticated
using ((select private.current_username()) is not null)
with check ((select private.current_username()) is not null);
create policy public_cards_member_delete
on public.public_cards for delete to authenticated
using ((select private.current_username()) is not null);

create policy notices_authenticated_select
on public.notices for select to authenticated
using ((select private.current_username()) is not null);
create policy notices_creator_insert
on public.notices for insert to authenticated
with check (
  created_by = (select private.current_username())
  and coalesce(acknowledged_by, '{}'::text[]) = '{}'::text[]
);
create policy notices_creator_or_admin_update
on public.notices for update to authenticated
using (created_by = (select private.current_username()) or (select private.is_admin()))
with check (created_by = (select private.current_username()) or (select private.is_admin()));
create policy notices_creator_or_admin_delete
on public.notices for delete to authenticated
using (created_by = (select private.current_username()) or (select private.is_admin()));

create policy notice_reactions_authenticated_select
on public.notice_reactions for select to authenticated
using ((select private.current_username()) is not null);
create policy notice_reactions_owner_insert
on public.notice_reactions for insert to authenticated
with check (username = (select private.current_username()));
create policy notice_reactions_owner_delete
on public.notice_reactions for delete to authenticated
using (username = (select private.current_username()) or (select private.is_admin()));

create policy attendance_sites_authenticated_select
on public.attendance_sites for select to authenticated
using ((select private.current_username()) is not null);
create policy attendance_sites_member_insert
on public.attendance_sites for insert to authenticated
with check ((select private.current_username()) is not null);
create policy attendance_sites_member_update
on public.attendance_sites for update to authenticated
using ((select private.current_username()) is not null)
with check ((select private.current_username()) is not null);
create policy attendance_sites_admin_delete
on public.attendance_sites for delete to authenticated using ((select private.is_admin()));

create policy order_suppliers_authenticated_select
on public.order_suppliers for select to authenticated
using ((select private.current_username()) is not null);
create policy order_suppliers_admin_insert
on public.order_suppliers for insert to authenticated with check ((select private.is_admin()));
create policy order_suppliers_admin_update
on public.order_suppliers for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy order_suppliers_admin_delete
on public.order_suppliers for delete to authenticated using ((select private.is_admin()));

create policy order_items_authenticated_select
on public.order_items for select to authenticated
using ((select private.current_username()) is not null);
create policy order_items_admin_insert
on public.order_items for insert to authenticated with check ((select private.is_admin()));
create policy order_items_admin_update
on public.order_items for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy order_items_admin_delete
on public.order_items for delete to authenticated using ((select private.is_admin()));

create policy company_calendar_authenticated_select
on public.company_calendar_settings for select to authenticated
using ((select private.current_username()) is not null);
create policy company_calendar_admin_insert
on public.company_calendar_settings for insert to authenticated with check ((select private.is_admin()));
create policy company_calendar_admin_update
on public.company_calendar_settings for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy company_calendar_admin_delete
on public.company_calendar_settings for delete to authenticated using ((select private.is_admin()));

create policy public_attendance_authenticated_select
on public.public_attendance_months for select to authenticated
using ((select private.current_username()) is not null);
create policy public_attendance_admin_insert
on public.public_attendance_months for insert to authenticated with check ((select private.is_admin()));
create policy public_attendance_admin_update
on public.public_attendance_months for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy public_attendance_admin_delete
on public.public_attendance_months for delete to authenticated using ((select private.is_admin()));

-- Shared workflows.
create policy cross_dept_requests_participant_select
on public.cross_dept_requests for select to authenticated
using (
  created_by = (select private.current_username())
  or to_dept = (select private.current_department())
  or (select private.is_admin())
);
create policy cross_dept_requests_creator_insert
on public.cross_dept_requests for insert to authenticated
with check (
  created_by = (select private.current_username())
  and from_dept = (select private.current_department())
);
create policy cross_dept_requests_participant_update
on public.cross_dept_requests for update to authenticated
using (
  created_by = (select private.current_username())
  or to_dept = (select private.current_department())
  or (select private.is_admin())
)
with check (
  created_by = (select private.current_username())
  or to_dept = (select private.current_department())
  or (select private.is_admin())
);
create policy cross_dept_requests_creator_or_admin_delete
on public.cross_dept_requests for delete to authenticated
using (created_by = (select private.current_username()) or (select private.is_admin()));

create policy assigned_tasks_participant_select
on public.assigned_tasks for select to authenticated
using (
  assigned_by = (select private.current_username())
  or assigned_to = (select private.current_username())
  or (select private.current_username()) = any(coalesce(shared_with, '{}'::text[]))
  or (select private.is_admin())
);
create policy assigned_tasks_creator_insert
on public.assigned_tasks for insert to authenticated
with check (assigned_by = (select private.current_username()) or (select private.is_admin()));
create policy assigned_tasks_participant_update
on public.assigned_tasks for update to authenticated
using (
  assigned_by = (select private.current_username())
  or assigned_to = (select private.current_username())
  or (select private.current_username()) = any(coalesce(shared_with, '{}'::text[]))
  or (select private.is_admin())
)
with check (
  assigned_by = (select private.current_username())
  or assigned_to = (select private.current_username())
  or (select private.current_username()) = any(coalesce(shared_with, '{}'::text[]))
  or (select private.is_admin())
);
create policy assigned_tasks_creator_or_admin_delete
on public.assigned_tasks for delete to authenticated
using (assigned_by = (select private.current_username()) or (select private.is_admin()));

create policy task_comments_participant_select
on public.task_comments for select to authenticated
using (exists (
  select 1 from public.assigned_tasks as task
  where task.id = task_id
));
create policy task_comments_participant_insert
on public.task_comments for insert to authenticated
with check (
  username = (select private.current_username())
  and exists (
    select 1 from public.assigned_tasks as task
    where task.id = task_id
  )
);
create policy task_comments_owner_delete
on public.task_comments for delete to authenticated
using (username = (select private.current_username()) or (select private.is_admin()));

create policy request_comments_participant_select
on public.request_comments for select to authenticated
using (exists (
  select 1 from public.cross_dept_requests as request
  where request.id = request_id
));
create policy request_comments_participant_insert
on public.request_comments for insert to authenticated
with check (
  username = (select private.current_username())
  and exists (
    select 1 from public.cross_dept_requests as request
    where request.id = request_id
  )
);
create policy request_comments_owner_delete
on public.request_comments for delete to authenticated
using (username = (select private.current_username()) or (select private.is_admin()));

create policy suggestions_reviewer_select
on public.suggestion_box for select to authenticated
using ((select private.can_view_suggestions()));
create policy suggestions_member_insert
on public.suggestion_box for insert to authenticated
with check (created_by = (select private.current_username()));
create policy suggestions_reviewer_update
on public.suggestion_box for update to authenticated
using ((select private.can_view_suggestions()))
with check ((select private.can_view_suggestions()));
create policy suggestions_reviewer_delete
on public.suggestion_box for delete to authenticated
using ((select private.can_view_suggestions()));

create policy trouble_reports_authenticated_select
on public.trouble_reports for select to authenticated
using ((select private.current_username()) is not null);
create policy trouble_reports_owner_insert
on public.trouble_reports for insert to authenticated
with check (
  reporter_username = (select private.current_username())
  and status = 'submitted'
  and coalesce(assignee, '') = ''
  and coalesce(admin_note, '') = ''
);
create policy trouble_reports_owner_or_admin_update
on public.trouble_reports for update to authenticated
using (reporter_username = (select private.current_username()) or (select private.is_admin()))
with check (reporter_username = (select private.current_username()) or (select private.is_admin()));

-- Orders are owner/admin readable. Sending state is mutated only by server RPCs.
create policy orders_owner_or_admin_select
on public.orders for select to authenticated
using (ordered_by = (select private.current_username()) or (select private.is_admin()));
create policy orders_owner_insert
on public.orders for insert to authenticated
with check (
  ordered_by = (select private.current_username())
  and not email_sent
  and email_sent_at is null
  and email_send_status = 'pending'
  and attempt_id is null
  and started_at is null
);
create policy orders_owner_or_admin_update
on public.orders for update to authenticated
using (ordered_by = (select private.current_username()) or (select private.is_admin()))
with check (ordered_by = (select private.current_username()) or (select private.is_admin()));

-- Chat membership controls room and message visibility.
create policy chat_rooms_member_select
on public.chat_rooms for select to authenticated
using ((select private.current_username()) = any(coalesce(members, '{}'::text[])));
create policy chat_rooms_member_insert
on public.chat_rooms for insert to authenticated
with check (
  type = 'group'
  and cardinality(coalesce(members, '{}'::text[])) between 2 and 50
  and created_by = (select private.current_username())
  and (select private.current_username()) = any(coalesce(members, '{}'::text[]))
);
create policy chat_rooms_member_update
on public.chat_rooms for update to authenticated
using ((select private.current_username()) = any(coalesce(members, '{}'::text[])))
with check ((select private.current_username()) = any(coalesce(members, '{}'::text[])));
create policy chat_rooms_member_delete
on public.chat_rooms for delete to authenticated
using ((select private.current_username()) = any(coalesce(members, '{}'::text[])));

create policy chat_messages_member_select
on public.chat_messages for select to authenticated
using (exists (
  select 1 from public.chat_rooms as room
  where room.id = room_id
));
create policy chat_messages_member_insert
on public.chat_messages for insert to authenticated
with check (
  username = (select private.current_username())
  and exists (
    select 1 from public.chat_rooms as room
    where room.id = room_id
  )
);
create policy chat_messages_owner_delete
on public.chat_messages for delete to authenticated
using (username = (select private.current_username()));

create policy drive_shares_participant_select
on public.drive_shares for select to authenticated
using (
  "from" = (select private.current_username())
  or "to" = (select private.current_username())
);
create policy drive_shares_sender_insert
on public.drive_shares for insert to authenticated
with check (
  "from" = (select private.current_username())
  and nullif("to", '') is not null
);
create policy drive_shares_recipient_update
on public.drive_shares for update to authenticated
using ("to" = (select private.current_username()))
with check ("to" = (select private.current_username()));
create policy drive_shares_participant_delete
on public.drive_shares for delete to authenticated
using (
  "from" = (select private.current_username())
  or "to" = (select private.current_username())
);

create policy p2p_signals_participant_select
on public.p2p_signals for select to authenticated
using (
  "from" = (select private.current_username())
  or "to" = (select private.current_username())
);
create policy p2p_signals_sender_insert
on public.p2p_signals for insert to authenticated
with check (
  "from" = (select private.current_username())
  and nullif("to", '') is not null
);
create policy p2p_signals_participant_update
on public.p2p_signals for update to authenticated
using (
  "from" = (select private.current_username())
  or "to" = (select private.current_username())
)
with check (
  "from" = (select private.current_username())
  or "to" = (select private.current_username())
);
create policy p2p_signals_participant_delete
on public.p2p_signals for delete to authenticated
using (
  "from" = (select private.current_username())
  or "to" = (select private.current_username())
);

-- Remove broad legacy access before granting the minimum required operations.
revoke all privileges on table
  public.assigned_tasks, public.attendance_entries, public.attendance_sites,
  public.chat_messages, public.chat_rooms, public.company_calendar_settings,
  public.cross_dept_requests, public.drive_shares, public.notice_reactions,
  public.notices, public.order_items, public.order_suppliers, public.orders,
  public.p2p_signals, public.portal_config, public.private_cards,
  public.private_sections, public.public_attendance_months, public.public_cards,
  public.public_categories, public.request_comments, public.suggestion_box,
  public.task_comments, public.trouble_reports, public.user_accounts,
  public.user_chat_reads, public.user_drive_contacts, public.user_drive_links,
  public.user_email_contacts, public.user_lock_pins, public.user_notice_reads,
  public.user_preferences, public.user_profiles, public.user_section_orders,
  public.user_todos
from public, anon, authenticated;

grant all privileges on table
  public.assigned_tasks, public.attendance_entries, public.attendance_sites,
  public.chat_messages, public.chat_rooms, public.company_calendar_settings,
  public.cross_dept_requests, public.drive_shares, public.notice_reactions,
  public.notices, public.order_items, public.order_suppliers, public.orders,
  public.p2p_signals, public.portal_config, public.private_cards,
  public.private_sections, public.public_attendance_months, public.public_cards,
  public.public_categories, public.request_comments, public.suggestion_box,
  public.task_comments, public.trouble_reports, public.user_accounts,
  public.user_chat_reads, public.user_drive_contacts, public.user_drive_links,
  public.user_email_contacts, public.user_lock_pins, public.user_notice_reads,
  public.user_preferences, public.user_profiles, public.user_section_orders,
  public.user_todos
to service_role;

grant select on public.portal_config to authenticated;
grant update (
  departments, suggestion_box_viewers, mission_text, order_seed_version
) on public.portal_config to authenticated;

grant select on public.user_accounts to authenticated;
grant update (
  last_login_at, google_name, google_avatar_url,
  login_provider, last_google_login_at
) on public.user_accounts to authenticated;

grant select, insert, update, delete on
  public.user_profiles, public.user_preferences, public.user_lock_pins,
  public.user_section_orders, public.user_chat_reads, public.user_drive_links,
  public.user_drive_contacts, public.private_sections, public.private_cards,
  public.user_todos, public.attendance_entries, public.user_email_contacts,
  public.user_notice_reads
to authenticated;

grant select, insert, update, delete on
  public.public_categories, public.public_cards,
  public.attendance_sites, public.order_suppliers, public.order_items,
  public.company_calendar_settings, public.public_attendance_months,
  public.cross_dept_requests, public.assigned_tasks, public.suggestion_box
to authenticated;

grant select, insert, delete on public.notices to authenticated;
grant update (
  title, body, priority, target_scope,
  target_departments, require_acknowledgement
) on public.notices to authenticated;

grant select, insert, delete on
  public.notice_reactions, public.task_comments, public.request_comments,
  public.chat_messages
to authenticated;

grant select, insert, delete on public.drive_shares to authenticated;
grant update (status, viewed_at) on public.drive_shares to authenticated;

grant select, insert, delete on public.p2p_signals to authenticated;
grant update (status, answer) on public.p2p_signals to authenticated;

grant select on public.chat_rooms to authenticated;

grant select, insert on public.orders to authenticated;
grant update (note, deleted_at, deleted_by) on public.orders to authenticated;

grant select (
  id, report_date, reporter_username, department, mistake_type, project_key,
  site_id, title, occurrence_location, detail, cause, corrective_action,
  prevention_action, keywords, status, assignee, created_at, updated_at
) on public.trouble_reports to authenticated;
grant insert on public.trouble_reports to authenticated;
grant update (
  report_date, department, mistake_type, project_key, site_id, title,
  occurrence_location, detail, cause, corrective_action, prevention_action,
  keywords, status, assignee, admin_note
) on public.trouble_reports to authenticated;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;
revoke all privileges on table private.portal_rate_limits from public, anon, authenticated;
grant all privileges on table private.portal_rate_limits to service_role;

revoke all on function private.is_google_company_jwt() from public, anon, authenticated;
revoke all on function private.current_username() from public, anon, authenticated;
revoke all on function private.is_admin() from public, anon, authenticated;
revoke all on function private.current_department() from public, anon, authenticated;
revoke all on function private.can_view_suggestions() from public, anon, authenticated;
revoke all on function private.get_portal_client_config() from public, anon, authenticated;
revoke all on function private.can_place_private_card(text, text, text)
from public, anon, authenticated;
grant execute on function private.current_username() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.current_department() to authenticated;
grant execute on function private.can_view_suggestions() to authenticated;
grant execute on function private.get_portal_client_config() to authenticated;
grant execute on function private.can_place_private_card(text, text, text) to authenticated;

revoke all on function private.username_for_user_id(uuid, text)
from public, anon, authenticated;
revoke all on function private.is_admin_user(uuid, text)
from public, anon, authenticated;
revoke all on function private.guard_user_account_security() from public, anon, authenticated;
revoke all on function private.guard_public_card_actor() from public, anon, authenticated;
revoke all on function private.guard_attendance_site_actor() from public, anon, authenticated;
revoke all on function private.guard_assigned_task_update() from public, anon, authenticated;
revoke all on function private.guard_cross_dept_request_update()
from public, anon, authenticated;
revoke all on function private.guard_linked_request_task_delete()
from public, anon, authenticated;
revoke all on function private.guard_trouble_report_write()
from public, anon, authenticated;
revoke all on function private.guard_chat_message_write()
from public, anon, authenticated;
revoke all on function private.sync_chat_room_last_message()
from public, anon, authenticated;
revoke all on function private.guard_p2p_signal_write()
from public, anon, authenticated;

revoke all on table public.portal_client_config from public, anon;
grant select on table public.portal_client_config to authenticated;

revoke execute on function public.list_portal_user_directory() from public, anon;
grant execute on function public.list_portal_user_directory() to authenticated;

revoke execute on function public.claim_portal_account(text, text)
from public, anon, authenticated;
grant execute on function public.claim_portal_account(text, text)
to authenticated;

revoke execute on function public.deactivate_portal_account(text)
from public, anon, authenticated;
grant execute on function public.deactivate_portal_account(text)
to authenticated;

revoke execute on function public.admin_reset_lock_pin(text)
from public, anon, authenticated;
grant execute on function public.admin_reset_lock_pin(text)
to authenticated;

revoke execute on function public.acknowledge_notice(text)
from public, anon, authenticated;
grant execute on function public.acknowledge_notice(text)
to authenticated;

revoke execute on function public.sync_request_task_link(text, text, text)
from public, anon, authenticated;
grant execute on function public.sync_request_task_link(text, text, text)
to authenticated;

revoke execute on function public.delete_request_task_entity(text, text)
from public, anon, authenticated;
grant execute on function public.delete_request_task_entity(text, text)
to authenticated;

revoke execute on function public.set_public_attendance(text, text, text)
from public, anon, authenticated;
grant execute on function public.set_public_attendance(text, text, text)
to authenticated;

revoke execute on function public.list_trouble_reports(text, text, text)
from public, anon, authenticated;
grant execute on function public.list_trouble_reports(text, text, text)
to authenticated;

revoke execute on function public.list_attendance_work_summary(text[])
from public, anon, authenticated;
grant execute on function public.list_attendance_work_summary(text[])
to authenticated;

revoke execute on function public.ensure_dm_room(text, text)
from public, anon, authenticated;
grant execute on function public.ensure_dm_room(text, text)
to authenticated;

revoke execute on function public.create_group_room(text, text, text[])
from public, anon, authenticated;
grant execute on function public.create_group_room(text, text, text[])
to authenticated;

revoke execute on function public.leave_chat_room(text)
from public, anon, authenticated;
grant execute on function public.leave_chat_room(text)
to authenticated;

revoke execute on function public.prune_oldest_chat_message(text)
from public, anon, authenticated;
grant execute on function public.prune_oldest_chat_message(text)
to authenticated;

revoke execute on function public.append_p2p_candidate(text, text, text)
from public, anon, authenticated;
grant execute on function public.append_p2p_candidate(text, text, text)
to authenticated;

revoke execute on function public.consume_portal_rate_limit(
  uuid, text, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.consume_portal_rate_limit(
  uuid, text, text, integer, integer
) to service_role;

revoke execute on function public.claim_order_email_send(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.claim_order_email_send(uuid, text, text)
to service_role;

revoke execute on function public.finish_order_email_send(
  uuid, text, text, text, boolean
)
from public, anon, authenticated;
grant execute on function public.finish_order_email_send(
  uuid, text, text, text, boolean
)
to service_role;

revoke execute on function public.resolve_order_email_send(
  uuid, text, text, text, text
)
from public, anon, authenticated;
grant execute on function public.resolve_order_email_send(
  uuid, text, text, text, text
)
to service_role;

revoke execute on function public.authorize_order_email_resolution(
  uuid, text, text, text, text
)
from public, anon, authenticated;
grant execute on function public.authorize_order_email_resolution(
  uuid, text, text, text, text
)
to service_role;

revoke execute on function public.set_updated_at() from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema private
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema private
  revoke execute on functions from public, anon, authenticated;

commit;

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUPABASE_DIR = path.join(ROOT, 'supabase');
const HARDENING_MIGRATION = path.join(
  SUPABASE_DIR,
  'migrations',
  '20260723000000_harden_portal_rls.sql',
);
const MANAGED_TABLES = [
  'assigned_tasks',
  'attendance_entries',
  'attendance_sites',
  'chat_messages',
  'chat_rooms',
  'company_calendar_settings',
  'cross_dept_requests',
  'drive_shares',
  'notice_reactions',
  'notices',
  'order_items',
  'order_suppliers',
  'orders',
  'p2p_signals',
  'portal_config',
  'private_cards',
  'private_sections',
  'public_attendance_months',
  'public_cards',
  'public_categories',
  'request_comments',
  'suggestion_box',
  'task_comments',
  'trouble_reports',
  'user_accounts',
  'user_chat_reads',
  'user_drive_contacts',
  'user_drive_links',
  'user_email_contacts',
  'user_lock_pins',
  'user_notice_reads',
  'user_preferences',
  'user_profiles',
  'user_section_orders',
  'user_todos',
  'fittings',
  'floors',
  'sites',
  'workers',
];
const LOCKED_LEGACY_TABLES = ['fittings', 'floors', 'sites', 'workers'];
const IDS = {
  alice: '11111111-1111-4111-8111-111111111111',
  bob: '22222222-2222-4222-8222-222222222222',
  carol: '33333333-3333-4333-8333-333333333333',
  dave: '44444444-4444-4444-8444-444444444444',
};

function stripUnsupportedLocalExtension(sql) {
  // Production Supabase includes pgcrypto. PGlite does not ship that optional
  // extension, while modern PostgreSQL still provides gen_random_uuid().
  return sql.replace(/^create extension if not exists pgcrypto;\s*$/gim, '');
}

async function expectDbError(action, pattern, label) {
  let error = null;
  try {
    await action();
  } catch (caught) {
    error = caught;
  }
  assert(error, `${label}: expected a database error`);
  assert.match(`${error.message || error}`, pattern, label);
}

async function main() {
  const db = new PGlite();
  await db.waitReady;

  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users (
        id uuid primary key,
        email text,
        raw_app_meta_data jsonb
      );
      create table auth.identities (
        id text primary key,
        user_id uuid not null,
        provider text not null
      );
      create or replace function auth.uid()
      returns uuid
      language sql
      stable
      as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create or replace function auth.jwt()
      returns jsonb
      language sql
      stable
      as $$
        select coalesce(
          nullif(current_setting('request.jwt.claims', true), ''),
          '{}'
        )::jsonb
      $$;
      create table public.fittings (id uuid primary key);
      create table public.floors (id uuid primary key);
      create table public.sites (id uuid primary key);
      create table public.workers (id uuid primary key);
    `);

    const baseFiles = (await readdir(SUPABASE_DIR))
      .filter(name => /^\d+.*\.sql$/.test(name))
      .sort();
    for (const name of baseFiles) {
      const sql = stripUnsupportedLocalExtension(
        await readFile(path.join(SUPABASE_DIR, name), 'utf8'),
      );
      await db.exec(sql);
    }
    await db.exec(
      await readFile(
        path.join(
          SUPABASE_DIR,
          'migrations',
          '20260623040342_add_shared_link_drive_metadata.sql',
        ),
        'utf8',
      ),
    );
    await db.exec(await readFile(HARDENING_MIGRATION, 'utf8'));

    const setSession = async (
      id,
      email,
      { method = 'oauth', provider = 'google', providers = ['google'] } = {},
    ) => {
      await db.exec('reset role');
      const claims = {
        sub: id,
        email,
        role: 'authenticated',
        app_metadata: {
          provider,
          providers,
        },
        amr: [{ method, timestamp: 1700000000 }],
      };
      await db.query(
        `select
          set_config('request.jwt.claim.sub', $1, false),
          set_config('request.jwt.claims', $2, false)`,
        [id, JSON.stringify(claims)],
      );
      await db.exec('set role authenticated');
    };
    const setServiceRole = async () => {
      await db.exec('reset role');
      await db.query(
        `select
          set_config('request.jwt.claim.sub', '', false),
          set_config('request.jwt.claims', $1, false)`,
        [JSON.stringify({ role: 'service_role' })],
      );
      await db.exec('set role service_role');
    };

    const rls = await db.query(
      `select
        count(*)::int as total,
        count(*) filter (
          where relation.relrowsecurity and relation.relforcerowsecurity
        )::int as hardened
      from pg_class as relation
      join pg_namespace as namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = any($1::text[])`,
      [MANAGED_TABLES],
    );
    assert.deepEqual(rls.rows[0], {
      total: MANAGED_TABLES.length,
      hardened: MANAGED_TABLES.length,
    });

    const lockedLegacyAcl = await db.query(
      `select
        count(*) filter (
          where has_table_privilege('anon', relation.oid, 'SELECT')
             or has_table_privilege('anon', relation.oid, 'INSERT')
             or has_table_privilege('anon', relation.oid, 'UPDATE')
             or has_table_privilege('anon', relation.oid, 'DELETE')
             or has_table_privilege('authenticated', relation.oid, 'SELECT')
             or has_table_privilege('authenticated', relation.oid, 'INSERT')
             or has_table_privilege('authenticated', relation.oid, 'UPDATE')
             or has_table_privilege('authenticated', relation.oid, 'DELETE')
        )::int as browser_accessible,
        count(*) filter (
          where has_table_privilege('service_role', relation.oid, 'SELECT')
            and has_table_privilege('service_role', relation.oid, 'INSERT')
            and has_table_privilege('service_role', relation.oid, 'UPDATE')
            and has_table_privilege('service_role', relation.oid, 'DELETE')
        )::int as service_accessible
      from pg_class as relation
      join pg_namespace as namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = any($1::text[])`,
      [LOCKED_LEGACY_TABLES],
    );
    assert.deepEqual(lockedLegacyAcl.rows[0], {
      browser_accessible: 0,
      service_accessible: LOCKED_LEGACY_TABLES.length,
    });

    const acl = await db.query(`
      select
        has_function_privilege(
          'authenticated',
          'public.claim_portal_account(text,text)',
          'execute'
        ) as claim_auth,
        has_function_privilege(
          'anon',
          'public.claim_portal_account(text,text)',
          'execute'
        ) as claim_anon,
        has_function_privilege(
          'authenticated',
          'public.acknowledge_notice(text)',
          'execute'
        ) as acknowledge_auth,
        has_function_privilege(
          'anon',
          'public.acknowledge_notice(text)',
          'execute'
        ) as acknowledge_anon,
        has_function_privilege(
          'authenticated',
          'public.sync_request_task_link(text,text,text)',
          'execute'
        ) as request_task_link_auth,
        has_function_privilege(
          'anon',
          'public.sync_request_task_link(text,text,text)',
          'execute'
        ) as request_task_link_anon,
        has_function_privilege(
          'authenticated',
          'public.delete_request_task_entity(text,text)',
          'execute'
        ) as request_task_delete_auth,
        has_function_privilege(
          'anon',
          'public.delete_request_task_entity(text,text)',
          'execute'
        ) as request_task_delete_anon,
        has_function_privilege(
          'authenticated',
          'public.admin_reset_lock_pin(text)',
          'execute'
        ) as admin_reset_pin_auth,
        has_function_privilege(
          'anon',
          'public.admin_reset_lock_pin(text)',
          'execute'
        ) as admin_reset_pin_anon,
        has_function_privilege(
          'authenticated',
          'public.consume_portal_rate_limit(uuid,text,text,integer,integer)',
          'execute'
        ) as rate_auth,
        has_function_privilege(
          'service_role',
          'public.consume_portal_rate_limit(uuid,text,text,integer,integer)',
          'execute'
        ) as rate_service,
        has_function_privilege(
          'authenticated',
          'public.claim_order_email_send(uuid,text,text)',
          'execute'
        ) as order_claim_auth,
        has_function_privilege(
          'service_role',
          'public.claim_order_email_send(uuid,text,text)',
          'execute'
        ) as order_claim_service,
        has_function_privilege(
          'authenticated',
          'public.finish_order_email_send(uuid,text,text,text,boolean)',
          'execute'
        ) as order_finish_auth,
        has_function_privilege(
          'service_role',
          'public.finish_order_email_send(uuid,text,text,text,boolean)',
          'execute'
        ) as order_finish_service,
        has_function_privilege(
          'authenticated',
          'public.authorize_order_email_resolution(uuid,text,text,text,text)',
          'execute'
        ) as order_authorize_auth,
        has_function_privilege(
          'service_role',
          'public.authorize_order_email_resolution(uuid,text,text,text,text)',
          'execute'
        ) as order_authorize_service,
        has_function_privilege(
          'authenticated',
          'public.resolve_order_email_send(uuid,text,text,text,text)',
          'execute'
        ) as order_resolve_auth,
        has_function_privilege(
          'service_role',
          'public.resolve_order_email_send(uuid,text,text,text,text)',
          'execute'
        ) as order_resolve_service
    `);
    assert.deepEqual(acl.rows[0], {
      claim_auth: true,
      claim_anon: false,
      acknowledge_auth: true,
      acknowledge_anon: false,
      request_task_link_auth: true,
      request_task_link_anon: false,
      request_task_delete_auth: true,
      request_task_delete_anon: false,
      admin_reset_pin_auth: true,
      admin_reset_pin_anon: false,
      rate_auth: false,
      rate_service: true,
      order_claim_auth: false,
      order_claim_service: true,
      order_finish_auth: false,
      order_finish_service: true,
      order_authorize_auth: false,
      order_authorize_service: true,
      order_resolve_auth: false,
      order_resolve_service: true,
    });

    await db.query(
      `insert into auth.users (id, email, raw_app_meta_data)
      values
        ($1, 'alice@framex.co.jp', '{"provider":"google","providers":["google"]}'),
        ($2, 'bob@framex.co.jp', '{"provider":"google","providers":["google"]}'),
        ($3, 'carol@framex.co.jp', '{"provider":"google","providers":["google"]}'),
        ($4, 'dave.portal.test@gmail.com', '{"provider":"google","providers":["google"]}')`,
      [IDS.alice, IDS.bob, IDS.carol, IDS.dave],
    );
    await db.query(
      `insert into auth.identities (id, user_id, provider)
      values
        ('alice-google', $1, 'google'),
        ('bob-google', $2, 'google'),
        ('carol-google', $3, 'google'),
        ('dave-google', $4, 'google')`,
      [IDS.alice, IDS.bob, IDS.carol, IDS.dave],
    );
    await db.query(
      `insert into public.user_accounts (
        username, google_auth_id, google_email,
        is_active, is_admin, access_department
      )
      values
        ('Alice', $1, 'alice@framex.co.jp', true, false, '設計'),
        ('Bob', $2, 'bob@framex.co.jp', true, false, '工場'),
        ('Carol', null, 'carol@framex.co.jp', true, true, '営業')`,
      [IDS.alice, IDS.bob],
    );
    await expectDbError(
      () => db.exec(`
        insert into public.user_accounts (
          username, google_email, is_active
        )
        values ('Duplicate Alice', 'ALICE@FRAMEX.CO.JP', true)
      `),
      /duplicate key|unique/i,
      'case-insensitive registered Google email uniqueness',
    );
    await db.exec(`
      insert into public.public_categories (id, label)
      values ('common', '共通');
    `);

    await setSession(IDS.alice, 'alice@framex.co.jp', {
      method: 'password',
      providers: ['google'],
    });
    const passwordRead = await db.query(
      'select count(*)::int as count from public.public_categories',
    );
    assert.equal(passwordRead.rows[0].count, 0);

    await setSession(IDS.alice, 'alice@framex.co.jp', {
      provider: 'github',
      providers: ['github', 'google'],
    });
    const mixedProviderRead = await db.query(
      'select count(*)::int as count from public.public_categories',
    );
    assert.equal(mixedProviderRead.rows[0].count, 0);

    await setSession(IDS.alice, 'alice@framex.co.jp', {
      provider: '',
      providers: ['google'],
    });
    const providerListOnlyRead = await db.query(
      'select count(*)::int as count from public.public_categories',
    );
    assert.equal(providerListOnlyRead.rows[0].count, 0);

    await db.exec('reset role');
    await db.exec(`
      update auth.identities
      set provider = 'github'
      where user_id = '${IDS.alice}'
    `);
    await setSession(IDS.alice, 'alice@framex.co.jp');
    const nonGoogleIdentityRead = await db.query(
      'select count(*)::int as count from public.public_categories',
    );
    assert.equal(nonGoogleIdentityRead.rows[0].count, 0);
    await db.exec('reset role');
    await db.exec(`
      update auth.identities
      set provider = 'google'
      where user_id = '${IDS.alice}'
    `);

    await setSession(IDS.alice, 'alice@framex.co.jp');
    const oauthRead = await db.query(
      'select count(*)::int as count from public.public_categories',
    );
    assert.equal(oauthRead.rows[0].count, 1);

    // A valid Google JWT cannot take over an allowlisted row belonging to a
    // different Supabase user id, even when its email claim is copied.
    await db.exec('reset role');
    await db.exec(`
      update auth.users
      set email = 'alice@framex.co.jp'
      where id = '${IDS.dave}'
    `);
    await setSession(IDS.dave, 'alice@framex.co.jp');
    const differentUidRead = await db.query(
      'select count(*)::int as count from public.public_categories',
    );
    assert.equal(differentUidRead.rows[0].count, 0);
    await db.exec('reset role');
    await db.exec(`
      update auth.users
      set email = 'dave.portal.test@gmail.com'
      where id = '${IDS.dave}'
    `);

    await setSession(IDS.carol, 'carol@framex.co.jp');
    const claim = await db.query(
      `select *
      from public.claim_portal_account(
        'Carol Test',
        'https://example.com/carol.png'
      )`,
    );
    assert.equal(claim.rows.length, 1);
    assert.equal(claim.rows[0].username, 'Carol');
    assert.equal(claim.rows[0].google_auth_id, IDS.carol);
    assert.equal(claim.rows[0].is_active, true);
    assert.equal(claim.rows[0].is_admin, true);

    await setSession(IDS.dave, 'dave.portal.test@gmail.com');
    const unprovisionedClaim = await db.query(
      `select * from public.claim_portal_account('Dave', '')`,
    );
    assert.equal(unprovisionedClaim.rows.length, 0);
    const unprovisionedGmailRead = await db.query(
      'select count(*)::int as count from public.public_categories',
    );
    assert.equal(unprovisionedGmailRead.rows[0].count, 0);
    await expectDbError(
      () => db.exec(`
        insert into public.user_accounts (
          username, google_auth_id, google_email
        )
        values ('Dave', '${IDS.dave}', 'dave.portal.test@gmail.com')
      `),
      /permission denied/i,
      'unprovisioned self-registration',
    );

    await setSession(IDS.alice, 'alice@framex.co.jp');
    const task = await db.query(`
      insert into public.assigned_tasks (
        id, title, assigned_by, assigned_to, shared_with, shared_responses
      )
      values (
        'task-1', '確認', 'Mallory', 'Bob',
        array['Carol'], '{"Carol":"accepted"}'
      )
      returning assigned_by, status, shared_responses
    `);
    assert.equal(task.rows[0].assigned_by, 'Alice');
    assert.equal(task.rows[0].status, 'pending');
    assert.deepEqual(task.rows[0].shared_responses, { Carol: 'pending' });

    await setSession(IDS.bob, 'bob@framex.co.jp');
    const acceptedTask = await db.query(`
      update public.assigned_tasks
      set status = 'accepted', accepted_at = now()
      where id = 'task-1'
      returning status
    `);
    assert.equal(acceptedTask.rows[0].status, 'accepted');

    await setSession(IDS.carol, 'carol@framex.co.jp');
    const sharedTask = await db.query(`
      update public.assigned_tasks
      set shared_responses = jsonb_set(
        shared_responses,
        '{Carol}',
        '"accepted"'::jsonb
      )
      where id = 'task-1'
      returning shared_responses
    `);
    assert.deepEqual(sharedTask.rows[0].shared_responses, {
      Carol: 'accepted',
    });

    await setSession(IDS.alice, 'alice@framex.co.jp');
    const request = await db.query(`
      insert into public.cross_dept_requests (
        id, title, to_dept, from_dept, created_by
      )
      values ('request-1', '確認依頼', '工場', '偽部署', 'Mallory')
      returning from_dept, created_by, status
    `);
    assert.deepEqual(request.rows[0], {
      from_dept: '設計',
      created_by: 'Alice',
      status: 'submitted',
    });

    await setSession(IDS.bob, 'bob@framex.co.jp');
    const receivedUpdate = await db.query(`
      update public.cross_dept_requests
      set
        status = 'reviewing',
        status_note = '確認中',
        status_updated_by = 'Bob'
      where id = 'request-1'
      returning status
    `);
    assert.equal(receivedUpdate.rows[0].status, 'reviewing');

    await db.exec(`
      insert into public.assigned_tasks (
        id, title, assigned_by, assigned_to, source_type,
        source_request_id, source_request_from_dept, source_request_to_dept
      )
      values (
        'request-task-1', '依頼対応', 'Mallory', 'Alice',
        'cross_dept_request', 'request-1', '設計', '工場'
      )
    `);
    await expectDbError(
      () => db.exec(`
        update public.cross_dept_requests
        set
          linked_task_id = 'request-task-1',
          linked_task_status = 'done',
          linked_task_assigned_to = 'Mallory'
        where id = 'request-1'
      `),
      /task-link RPC/i,
      'direct linked-task field forgery',
    );
    const linkedRequest = await db.query(`
      select public.sync_request_task_link(
        'request-1', 'request-task-1', 'link'
      ) as ok
    `);
    assert.equal(linkedRequest.rows[0].ok, true);
    const linkedRequestState = await db.query(`
      select
        status,
        linked_task_id,
        linked_task_status,
        linked_task_assigned_to,
        linked_task_linked_by,
        linked_task_linked_at is not null as linked_at_set,
        linked_task_closed_at is null as remains_open
      from public.cross_dept_requests
      where id = 'request-1'
    `);
    assert.deepEqual(linkedRequestState.rows[0], {
      status: 'accepted',
      linked_task_id: 'request-task-1',
      linked_task_status: 'pending',
      linked_task_assigned_to: 'Alice',
      linked_task_linked_by: 'Bob',
      linked_at_set: true,
      remains_open: true,
    });

    await setSession(IDS.alice, 'alice@framex.co.jp');
    await db.exec(`
      insert into public.cross_dept_requests (
        id, title, to_dept, from_dept, created_by
      )
      values ('request-2', '別の依頼', '工場', '偽部署', 'Mallory')
    `);
    await setSession(IDS.bob, 'bob@framex.co.jp');
    await db.exec(`
      insert into public.assigned_tasks (
        id, title, assigned_by, assigned_to, source_type,
        source_request_id, source_request_from_dept, source_request_to_dept
      )
      values (
        'request-task-2', '別依頼対応', 'Mallory', 'Alice',
        'cross_dept_request', 'request-2', '設計', '工場'
      )
    `);
    await expectDbError(
      () => db.query(`
        select public.sync_request_task_link(
          'request-1', 'request-task-2', 'link'
        )
      `),
      /does not belong to this request/i,
      'task from another request',
    );
    await expectDbError(
      () => db.query(`
        select public.sync_request_task_link(
          'request-2', 'request-task-1', 'link'
        )
      `),
      /does not belong to this request/i,
      'request from another task',
    );
    await setSession(IDS.carol, 'carol@framex.co.jp');
    await expectDbError(
      () => db.exec(`
        update public.cross_dept_requests
        set linked_task_status = 'done'
        where id = 'request-1'
      `),
      /task-link RPC/i,
      'administrator direct linked-task field forgery',
    );
    await expectDbError(
      () => db.query(`
        select public.sync_request_task_link(
          'request-2', 'request-task-2', 'link'
        )
      `),
      /destination department task creator/i,
      'administrator linking another user task',
    );
    await setSession(IDS.bob, 'bob@framex.co.jp');
    const secondLink = await db.query(`
      select public.sync_request_task_link(
        'request-2', 'request-task-2', 'link'
      ) as ok
    `);
    assert.equal(secondLink.rows[0].ok, true);

    await setServiceRole();
    await db.exec(`
      update public.user_accounts
      set is_admin = false
      where username = 'Carol'
    `);
    await setSession(IDS.carol, 'carol@framex.co.jp');
    const unrelatedRequest = await db.query(`
      select count(*)::int as count
      from public.cross_dept_requests
      where id = 'request-1'
    `);
    assert.equal(unrelatedRequest.rows[0].count, 0);
    await expectDbError(
      () => db.query(`
        select public.sync_request_task_link(
          'request-1', 'request-task-1', 'sync'
        )
      `),
      /linked task participant/i,
      'third-party task synchronization',
    );
    await expectDbError(
      () => db.query(`
        select public.sync_request_task_link(
          'request-1', 'request-task-1', 'unlink'
        )
      `),
      /task creator or an administrator/i,
      'third-party task unlink',
    );
    await setServiceRole();
    await db.exec(`
      update public.user_accounts
      set is_admin = true
      where username = 'Carol'
    `);

    await setSession(IDS.alice, 'alice@framex.co.jp');
    await db.exec(`
      update public.assigned_tasks
      set status = 'accepted', accepted_at = now()
      where id = 'request-task-1'
    `);
    const assigneeSync = await db.query(`
      select public.sync_request_task_link(
        'request-1', 'request-task-1', 'sync'
      ) as ok
    `);
    assert.equal(assigneeSync.rows[0].ok, true);
    const acceptedRequestLink = await db.query(`
      select linked_task_status, linked_task_assigned_to
      from public.cross_dept_requests
      where id = 'request-1'
    `);
    assert.deepEqual(acceptedRequestLink.rows[0], {
      linked_task_status: 'accepted',
      linked_task_assigned_to: 'Alice',
    });

    await setSession(IDS.bob, 'bob@framex.co.jp');
    await expectDbError(
      () => db.query(`
        delete from public.assigned_tasks
        where id = 'request-task-1'
      `),
      /request-task delete RPC/i,
      'direct linked task deletion',
    );
    const creatorDelete = await db.query(`
      select public.delete_request_task_entity(
        'task', 'request-task-1'
      ) as ok
    `);
    assert.equal(creatorDelete.rows[0].ok, true);
    const unlinkedRequest = await db.query(`
      select
        linked_task_id,
        linked_task_status,
        linked_task_assigned_to,
        linked_task_closed_at is not null as closed_at_set
      from public.cross_dept_requests
      where id = 'request-1'
    `);
    assert.deepEqual(unlinkedRequest.rows[0], {
      linked_task_id: null,
      linked_task_status: 'cancelled',
      linked_task_assigned_to: 'Alice',
      closed_at_set: true,
    });
    const deletedLinkedTask = await db.query(`
      select count(*)::int as count
      from public.assigned_tasks
      where id = 'request-task-1'
    `);
    assert.equal(deletedLinkedTask.rows[0].count, 0);

    await setSession(IDS.alice, 'alice@framex.co.jp');
    await db.exec(`
      update public.assigned_tasks
      set status = 'accepted', accepted_at = now()
      where id = 'request-task-2'
    `);
    await db.query(`
      select public.sync_request_task_link(
        'request-2', 'request-task-2', 'sync'
      )
    `);
    await db.exec(`
      update public.assigned_tasks
      set status = 'done', done_at = now()
      where id = 'request-task-2'
    `);
    const doneSync = await db.query(`
      select public.sync_request_task_link(
        'request-2', 'request-task-2', 'sync'
      ) as ok
    `);
    assert.equal(doneSync.rows[0].ok, true);
    const completedRequestLink = await db.query(`
      select
        linked_task_id,
        linked_task_status,
        linked_task_assigned_to,
        linked_task_closed_at is not null as closed_at_set
      from public.cross_dept_requests
      where id = 'request-2'
    `);
    assert.deepEqual(completedRequestLink.rows[0], {
      linked_task_id: 'request-task-2',
      linked_task_status: 'done',
      linked_task_assigned_to: 'Alice',
      closed_at_set: true,
    });
    await expectDbError(
      () => db.query(`
        delete from public.cross_dept_requests
        where id = 'request-2'
      `),
      /request-task delete RPC/i,
      'direct linked request deletion',
    );
    const creatorRequestDelete = await db.query(`
      select public.delete_request_task_entity(
        'request', 'request-2'
      ) as ok
    `);
    assert.equal(creatorRequestDelete.rows[0].ok, true);
    const deletedLinkedRequest = await db.query(`
      select count(*)::int as count
      from public.cross_dept_requests
      where id = 'request-2'
    `);
    assert.equal(deletedLinkedRequest.rows[0].count, 0);
    const detachedTask = await db.query(`
      select
        source_type,
        source_request_id,
        source_request_from_dept,
        source_request_to_dept
      from public.assigned_tasks
      where id = 'request-task-2'
    `);
    assert.deepEqual(detachedTask.rows[0], {
      source_type: 'manual',
      source_request_id: null,
      source_request_from_dept: null,
      source_request_to_dept: null,
    });

    await setSession(IDS.alice, 'alice@framex.co.jp');
    await db.exec(`
      insert into public.notices (
        id, title, created_by, acknowledged_by
      )
      values ('notice-1', '確認', 'Alice', '{}')
    `);
    await expectDbError(
      () => db.exec(`
        update public.notices
        set acknowledged_by = array['Mallory']
        where id = 'notice-1'
      `),
      /permission denied/i,
      'direct notice acknowledgement forgery',
    );
    await setSession(IDS.bob, 'bob@framex.co.jp');
    const acknowledgement = await db.query(
      `select public.acknowledge_notice('notice-1') as ok`,
    );
    assert.equal(acknowledgement.rows[0].ok, true);

    await setSession(IDS.alice, 'alice@framex.co.jp');
    const dm = await db.query(
      `select public.ensure_dm_room('Alice_Bob', 'Bob') as ok`,
    );
    assert.equal(dm.rows[0].ok, true);
    const chatMessage = await db.query(`
      insert into public.chat_messages (
        id, room_id, username, text
      )
      values ('message-1', 'Alice_Bob', 'Mallory', '確認しました')
      returning username, created_at
    `);
    assert.equal(chatMessage.rows[0].username, 'Alice');
    const roomPreview = await db.query(`
      select last_message, last_sender, last_at
      from public.chat_rooms
      where id = 'Alice_Bob'
    `);
    assert.equal(roomPreview.rows[0].last_message, '確認しました');
    assert.equal(roomPreview.rows[0].last_sender, 'Alice');
    assert.equal(
      new Date(roomPreview.rows[0].last_at).getTime(),
      new Date(chatMessage.rows[0].created_at).getTime(),
    );
    await expectDbError(
      () => db.exec(`
        update public.chat_rooms
        set last_message = '偽装'
        where id = 'Alice_Bob'
      `),
      /permission denied/i,
      'direct chat room preview forgery',
    );
    await setSession(IDS.bob, 'bob@framex.co.jp');
    const participantRoom = await db.query(`
      select count(*)::int as count
      from public.chat_rooms
      where id = 'Alice_Bob'
    `);
    assert.equal(participantRoom.rows[0].count, 1);
    await setSession(IDS.carol, 'carol@framex.co.jp');
    const adminRoom = await db.query(`
      select count(*)::int as count
      from public.chat_rooms
      where id = 'Alice_Bob'
    `);
    assert.equal(adminRoom.rows[0].count, 0);
    // The non-creator leaving a DM must delete the room and cascade its
    // history. Otherwise the creator could reuse the id with another member.
    await setSession(IDS.bob, 'bob@framex.co.jp');
    const leftRoom = await db.query(
      `select public.leave_chat_room('Alice_Bob') as ok`,
    );
    assert.equal(leftRoom.rows[0].ok, true);
    await setServiceRole();
    const deletedDmState = await db.query(`
      select
        (select count(*)::int from public.chat_rooms where id = 'Alice_Bob') as rooms,
        (select count(*)::int from public.chat_messages where room_id = 'Alice_Bob') as messages
    `);
    assert.deepEqual(deletedDmState.rows[0], { rooms: 0, messages: 0 });

    await setSession(IDS.alice, 'alice@framex.co.jp');
    const reusedDmId = await db.query(
      `select public.ensure_dm_room('Alice_Bob', 'Carol') as ok`,
    );
    assert.equal(reusedDmId.rows[0].ok, true);
    await setSession(IDS.carol, 'carol@framex.co.jp');
    const roomAfterLeave = await db.query(`
      select
        (select count(*)::int from public.chat_rooms where id = 'Alice_Bob') as rooms,
        (select count(*)::int from public.chat_messages where room_id = 'Alice_Bob') as messages
    `);
    assert.deepEqual(roomAfterLeave.rows[0], { rooms: 1, messages: 0 });

    await setSession(IDS.alice, 'alice@framex.co.jp');
    await db.exec(`
      insert into public.drive_shares (
        id, "from", "to", drive_url
      )
      values (
        'drive-1', 'Alice', 'Bob', 'https://drive.google.com/example'
      )
    `);
    await setSession(IDS.carol, 'carol@framex.co.jp');
    const adminDrive = await db.query(`
      select count(*)::int as count
      from public.drive_shares
      where id = 'drive-1'
    `);
    assert.equal(adminDrive.rows[0].count, 0);

    await setSession(IDS.bob, 'bob@framex.co.jp');
    await db.exec(`
      insert into public.trouble_reports (
        id, title, reporter_username, reporter_email,
        status, assignee, admin_note
      )
      values (
        'trouble-1', '試験', 'Mallory', 'x@example.com',
        'done', 'Mallory', 'secret'
      )
    `);
    await setSession(IDS.alice, 'alice@framex.co.jp');
    const publicTrouble = await db.query(`
      select reporter_email, admin_note
      from public.list_trouble_reports('all', '', '')
      where id = 'trouble-1'
    `);
    assert.deepEqual(publicTrouble.rows[0], {
      reporter_email: '',
      admin_note: '',
    });
    await setSession(IDS.carol, 'carol@framex.co.jp');
    await db.exec(`
      update public.trouble_reports
      set
        status = 'reviewing',
        assignee = 'Carol',
        admin_note = '管理メモ'
      where id = 'trouble-1'
    `);
    const adminTrouble = await db.query(`
      select reporter_email, admin_note
      from public.list_trouble_reports('all', '', '')
      where id = 'trouble-1'
    `);
    assert.deepEqual(adminTrouble.rows[0], {
      reporter_email: 'bob@framex.co.jp',
      admin_note: '管理メモ',
    });
    await setSession(IDS.bob, 'bob@framex.co.jp');
    await expectDbError(
      () => db.exec(`
        update public.trouble_reports
        set status = 'done'
        where id = 'trouble-1'
      `),
      /Only an administrator/i,
      'reporter workflow escalation',
    );

    await setSession(IDS.carol, 'carol@framex.co.jp');
    await db.exec(`
      update public.portal_config
      set suggestion_box_viewers = array['Alice']
      where id = 1;

      insert into public.order_suppliers (
        id, name, email, active
      )
      values (
        'supplier-1', 'テスト仕入先', 'orders@example.com', true
      );
    `);
    await setSession(IDS.alice, 'alice@framex.co.jp');
    await expectDbError(
      () => db.exec(`
        insert into public.order_suppliers (
          id, name, email, active
        )
        values (
          'supplier-forged', '偽仕入先', 'forged@example.com', true
        )
      `),
      /row-level security/i,
      'suggestion viewer administrator escalation',
    );
    await db.exec(`
      insert into public.orders (
        id, supplier_id, supplier_name, supplier_email,
        order_type, items, ordered_by
      )
      values (
        'order-1', 'supplier-1', '', '',
        'factory', '[{"name":"鋼材","quantity":1}]'::jsonb, 'Alice'
      )
    `);
    await setServiceRole();
    const firstOrderClaim = await db.query(
      `select public.claim_order_email_send($1, $2, $3) as result`,
      [IDS.alice, 'alice@framex.co.jp', 'order-1'],
    );
    assert.equal(firstOrderClaim.rows[0].result.claimed, true);
    assert.equal(firstOrderClaim.rows[0].result.status, 'sending');
    await db.exec(`
      update public.orders
      set started_at = timezone('utc', now()) - interval '1 day'
      where id = 'order-1'
    `);
    const reconciliationRateLimit = await db.query(
      `select public.consume_portal_rate_limit(
        $1, $2, 'order-email-reconcile', 20, 3600
      ) as allowed`,
      [IDS.alice, 'alice@framex.co.jp'],
    );
    assert.equal(reconciliationRateLimit.rows[0].allowed, true);
    const staleOrderClaim = await db.query(
      `select public.claim_order_email_send($1, $2, $3) as result`,
      [IDS.alice, 'alice@framex.co.jp', 'order-1'],
    );
    assert.deepEqual(staleOrderClaim.rows[0].result, {
      claimed: false,
      status: 'sending',
    });
    const firstOrderAttemptId = firstOrderClaim.rows[0].result.attempt_id;

    await setServiceRole();
    await expectDbError(
      () => db.query(
        `select public.authorize_order_email_resolution(
          '${IDS.alice}',
          'alice@framex.co.jp',
          'order-1',
          '${firstOrderAttemptId}',
          'not_sent'
        )`,
      ),
      /Administrator access is required/i,
      'non-administrator order email reconciliation authorization',
    );
    await expectDbError(
      () => db.query(
        `select public.resolve_order_email_send(
          '${IDS.alice}',
          'alice@framex.co.jp',
          'order-1',
          '${firstOrderAttemptId}',
          'not_sent'
        )`,
      ),
      /Administrator access is required/i,
      'non-administrator order email resolution',
    );
    const wrongAttemptAuthorization = await db.query(
      `select public.authorize_order_email_resolution(
        '${IDS.carol}',
        'carol@framex.co.jp',
        'order-1',
        'wrong-attempt',
        'not_sent'
      ) as ok`,
    );
    assert.equal(wrongAttemptAuthorization.rows[0].ok, false);
    const firstAuthorization = await db.query(
      `select public.authorize_order_email_resolution(
        '${IDS.carol}',
        'carol@framex.co.jp',
        'order-1',
        '${firstOrderAttemptId}',
        'not_sent'
      ) as ok`,
    );
    assert.equal(firstAuthorization.rows[0].ok, true);
    const wrongAttemptResolution = await db.query(
      `select public.resolve_order_email_send(
        '${IDS.carol}',
        'carol@framex.co.jp',
        'order-1',
        'wrong-attempt',
        'not_sent'
      ) as ok`,
    );
    assert.equal(wrongAttemptResolution.rows[0].ok, false);
    const firstResolution = await db.query(
      `select public.resolve_order_email_send(
        '${IDS.carol}',
        'carol@framex.co.jp',
        'order-1',
        '${firstOrderAttemptId}',
        'not_sent'
      ) as ok`,
    );
    assert.equal(firstResolution.rows[0].ok, true);
    const repeatedFirstResolution = await db.query(
      `select public.resolve_order_email_send(
        '${IDS.carol}',
        'carol@framex.co.jp',
        'order-1',
        '${firstOrderAttemptId}',
        'not_sent'
      ) as ok`,
    );
    assert.equal(repeatedFirstResolution.rows[0].ok, true);
    const repeatedFirstAuthorization = await db.query(
      `select public.authorize_order_email_resolution(
        '${IDS.carol}',
        'carol@framex.co.jp',
        'order-1',
        '${firstOrderAttemptId}',
        'not_sent'
      ) as ok`,
    );
    assert.equal(repeatedFirstAuthorization.rows[0].ok, true);
    await setSession(IDS.carol, 'carol@framex.co.jp');
    const failedOrder = await db.query(`
      select
        email_send_status,
        email_sent,
        email_resolution,
        email_resolution_by,
        email_resolved_at is not null as email_resolved
      from public.orders
      where id = 'order-1'
    `);
    assert.deepEqual(failedOrder.rows[0], {
      email_send_status: 'failed',
      email_sent: false,
      email_resolution: 'not_sent',
      email_resolution_by: 'Carol',
      email_resolved: true,
    });

    await setServiceRole();
    const retryOrderClaim = await db.query(
      `select public.claim_order_email_send($1, $2, $3) as result`,
      [IDS.alice, 'alice@framex.co.jp', 'order-1'],
    );
    assert.equal(retryOrderClaim.rows[0].result.claimed, true);
    assert.equal(retryOrderClaim.rows[0].result.status, 'sending');
    assert.notEqual(
      retryOrderClaim.rows[0].result.attempt_id,
      firstOrderAttemptId,
    );

    await setServiceRole();
    const finalResolution = await db.query(
      `select public.resolve_order_email_send(
        '${IDS.carol}',
        'carol@framex.co.jp',
        'order-1',
        '${retryOrderClaim.rows[0].result.attempt_id}',
        'sent'
      ) as ok`,
    );
    assert.equal(finalResolution.rows[0].ok, true);
    await setSession(IDS.carol, 'carol@framex.co.jp');
    const sentOrder = await db.query(`
      select
        email_send_status,
        email_sent,
        email_sent_at is not null as email_sent_recorded,
        email_resolution,
        email_resolution_by
      from public.orders
      where id = 'order-1'
    `);
    assert.deepEqual(sentOrder.rows[0], {
      email_send_status: 'sent',
      email_sent: true,
      email_sent_recorded: true,
      email_resolution: 'sent',
      email_resolution_by: 'Carol',
    });

    await setSession(IDS.alice, 'alice@framex.co.jp');
    await db.exec(`
      insert into public.attendance_entries (
        username, entry_date, note,
        work_site_hours, project_keys, year_month
      )
      values (
        'Alice', '2026-07-01', '個人メモ',
        '{"site-1":2}', array['P1'], '2026-07'
      )
    `);
    await setSession(IDS.bob, 'bob@framex.co.jp');
    await db.exec(`
      insert into public.attendance_entries (
        username, entry_date, note,
        work_site_hours, project_keys, year_month
      )
      values (
        'Bob', '2026-07-01', '秘密メモ',
        '{"site-1":3}', array['P1'], '2026-07'
      )
    `);
    await setSession(IDS.alice, 'alice@framex.co.jp');
    const attendance = await db.query(`
      select username, note, work_site_hours
      from public.list_attendance_work_summary(array['2026-07'])
      order by username
    `);
    assert.deepEqual(attendance.rows, [
      {
        username: 'Alice',
        note: '個人メモ',
        work_site_hours: { 'site-1': 2 },
      },
      {
        username: 'Bob',
        note: null,
        work_site_hours: { 'site-1': 3 },
      },
    ]);

    await setServiceRole();
    await db.exec(
      `insert into public.user_accounts (
        username, google_auth_id, google_email,
        is_active, is_admin, access_department
      )
      values (
        'Dave', null, 'dave.portal.test@gmail.com',
        true, false, '設計'
      )`,
    );
    await setSession(IDS.dave, 'dave.portal.test@gmail.com');
    const registeredGmailClaim = await db.query(
      `select * from public.claim_portal_account('Dave Gmail', '')`,
    );
    assert.equal(registeredGmailClaim.rows.length, 1);
    assert.equal(registeredGmailClaim.rows[0].username, 'Dave');
    assert.equal(registeredGmailClaim.rows[0].google_auth_id, IDS.dave);
    const registeredGmailRead = await db.query(
      'select count(*)::int as count from public.public_categories',
    );
    assert.equal(registeredGmailRead.rows[0].count, 1);
    await setSession(IDS.alice, 'alice@framex.co.jp');
    await expectDbError(
      () => db.query(
        `select public.deactivate_portal_account('Bob')`,
      ),
      /Administrator access is required/i,
      'non-administrator account deactivation',
    );
    await setServiceRole();
    await db.exec(`
      insert into public.user_lock_pins (
        username, enabled, hash, auto_lock_minutes
      )
      values ('Bob', true, 'old-hash', 30);
    `);
    await setSession(IDS.alice, 'alice@framex.co.jp');
    await expectDbError(
      () => db.query(
        `select public.admin_reset_lock_pin('Bob')`,
      ),
      /Administrator access is required/i,
      'non-administrator PIN reset',
    );
    await setSession(IDS.carol, 'carol@framex.co.jp');
    await expectDbError(
      () => db.exec(`
        update public.user_accounts
        set is_active = false
        where username = 'Bob'
      `),
      /permission denied/i,
      'direct account deactivation',
    );
    await expectDbError(
      () => db.query(
        `select public.deactivate_portal_account('Carol')`,
      ),
      /cannot be deactivated/i,
      'administrator self-deactivation',
    );
    const resetPin = await db.query(
      `select public.admin_reset_lock_pin('Bob') as ok`,
    );
    assert.equal(resetPin.rows[0].ok, true);
    await setSession(IDS.bob, 'bob@framex.co.jp');
    const bobLockPin = await db.query(`
      select enabled, hash, auto_lock_minutes
      from public.user_lock_pins
      where username = 'Bob'
    `);
    assert.deepEqual(bobLockPin.rows[0], {
      enabled: false,
      hash: null,
      auto_lock_minutes: 5,
    });
    await setSession(IDS.carol, 'carol@framex.co.jp');
    const deactivated = await db.query(
      `select public.deactivate_portal_account('Dave') as ok`,
    );
    assert.equal(deactivated.rows[0].ok, true);
    await setSession(IDS.dave, 'dave.portal.test@gmail.com');
    const inactiveClaim = await db.query(
      `select * from public.claim_portal_account('Dave', '')`,
    );
    assert.equal(inactiveClaim.rows.length, 0);
    const inactiveGmailRead = await db.query(
      'select count(*)::int as count from public.public_categories',
    );
    assert.equal(inactiveGmailRead.rows[0].count, 0);

    console.log(
      `Migration security verification passed (${MANAGED_TABLES.length} forced-RLS tables).`,
    );
  } finally {
    await db.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

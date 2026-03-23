import { state } from './state.js';
import { db, collection, doc, getDoc, getDocs } from './config.js';
import {
  applySupabaseRuntimeConfig,
  isSupabaseSharedCoreEnabled,
  loadSupabaseConfigFromStorage,
} from './supabase.js';

let deps = {};

export function initFirebaseCutover(d) {
  deps = d || {};
}

function logProgress(message) {
  deps.onProgress?.(message);
  console.log(`[firebase-cutover] ${message}`);
}

function toIsoTimestamp(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  if (typeof value === 'number') {
    const millis = value > 1e12 ? value : value * 1000;
    return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
  }
  if (value instanceof Date) {
    const millis = value.getTime();
    return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
  }
  if (typeof value?.toDate === 'function') {
    return toIsoTimestamp(value.toDate());
  }
  if (typeof value?.seconds === 'number') {
    const millis = (value.seconds * 1000) + Math.floor((value.nanoseconds || 0) / 1e6);
    return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
  }
  return null;
}

function isoOrNow(value) {
  return toIsoTimestamp(value) || new Date().toISOString();
}

function textList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => `${item ?? ''}`.trim()).filter(Boolean))];
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function numberOr(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function chunk(list, size = 200) {
  const rows = Array.isArray(list) ? list : [];
  const batches = [];
  for (let i = 0; i < rows.length; i += size) {
    batches.push(rows.slice(i, i + size));
  }
  return batches;
}

function normalizeDriveContactsMap(raw) {
  const contacts = {};
  const source = plainObject(raw?.contacts || raw);
  Object.entries(source).forEach(([username, entry]) => {
    if (!username) return;
    if (typeof entry === 'string') {
      contacts[username] = { url: entry };
      return;
    }
    if (entry && typeof entry === 'object') {
      contacts[username] = {
        url: `${entry.url || ''}`.trim(),
        savedAt: entry.savedAt || null,
      };
    }
  });
  return contacts;
}

function reportAdd(report, table, count) {
  if (!count) return;
  report.tables[table] = (report.tables[table] || 0) + count;
}

function sanitizeRows(rows = []) {
  return rows
    .map(row => Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined)))
    .filter(row => Object.keys(row).length > 0);
}

function getSupabaseHeaders(prefer = '') {
  const headers = {
    apikey: state.supabaseApiKey,
    Authorization: `Bearer ${state.supabaseApiKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  return headers;
}

async function requestSupabase(path, { method = 'GET', body = null, prefer = '' } = {}) {
  const response = await fetch(`${state.supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: getSupabaseHeaders(prefer),
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase ${method} ${path} failed (${response.status}): ${text.slice(0, 240)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function bulkUpsert(report, table, rows, { onConflict = '', mode = 'merge-duplicates', size = 200 } = {}) {
  const cleaned = sanitizeRows(rows);
  if (!cleaned.length) return 0;
  const path = onConflict ? `${table}?on_conflict=${encodeURIComponent(onConflict)}` : table;
  for (const batch of chunk(cleaned, size)) {
    await requestSupabase(path, {
      method: 'POST',
      prefer: `resolution=${mode},return=minimal`,
      body: batch,
    });
  }
  reportAdd(report, table, cleaned.length);
  return cleaned.length;
}

async function patchPortalConfig(report, fields) {
  const body = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
  if (!Object.keys(body).length) return;
  await requestSupabase('portal_config?id=eq.1', {
    method: 'PATCH',
    prefer: 'return=minimal',
    body,
  });
  reportAdd(report, 'portal_config', 1);
}

async function migratePortalConfig(report) {
  logProgress('Migrating portal_config');
  const snap = await getDoc(doc(db, 'portal', 'config'));
  if (!snap.exists()) return;
  const data = snap.data() || {};
  await patchPortalConfig(report, {
    pin_hash: data.pinHash || null,
    invite_code_hash: data.inviteCodeHash || null,
    invite_code_plain: data.inviteCodePlain || null,
    invite_updated_at: toIsoTimestamp(data.inviteUpdatedAt),
    gemini_api_key: data.geminiApiKey || '',
    departments: textList(data.departments),
    suggestion_box_viewers: textList(data.suggestionBoxViewers),
    mission_text: data.missionText || '',
    gas_order_url: data.gasOrderUrl || '',
    order_seed_version: numberOr(data.orderSeedVersion, 0),
  });
}

async function migrateUserAccounts(report) {
  logProgress('Migrating user_accounts');
  const snap = await getDocs(collection(db, 'users_list'));
  const usernames = snap.docs.map(docSnap => docSnap.id).filter(Boolean);
  const rows = snap.docs.map(docSnap => {
    const data = docSnap.data() || {};
    return {
      username: docSnap.id,
      last_login_at: toIsoTimestamp(data.lastLogin || data.last_login_at || data.updatedAt),
    };
  });
  await bulkUpsert(report, 'user_accounts', rows, { onConflict: 'username' });
  report.usernames = usernames;
  return usernames;
}

async function migrateSharedCore(report) {
  logProgress('Migrating categories, cards, notices, and reactions');
  const [categorySnap, cardSnap, noticeSnap, reactionSnap] = await Promise.all([
    getDocs(collection(db, 'categories')),
    getDocs(collection(db, 'cards')),
    getDocs(collection(db, 'notices')),
    getDocs(collection(db, 'notice_reactions')),
  ]);

  const categoryRows = categorySnap.docs.map(docSnap => {
    const data = docSnap.data() || {};
    const categoryId = `${data.id || docSnap.id}`;
    return {
      id: categoryId,
      label: data.label || '',
      icon: data.icon || 'fa-solid fa-folder',
      color_index: numberOr(data.colorIndex, 1),
      order_index: numberOr(data.order, 0),
      is_external: !!(data.isExternal ?? (categoryId === 'external')),
    };
  });

  const knownCategoryIds = new Set(categoryRows.map(row => row.id));
  const cardRows = cardSnap.docs.map(docSnap => {
    const data = docSnap.data() || {};
    const categoryId = `${data.category || ''}`.trim();
    if (categoryId && !knownCategoryIds.has(categoryId)) {
      knownCategoryIds.add(categoryId);
      categoryRows.push({
        id: categoryId,
        label: categoryId,
        icon: 'fa-solid fa-folder',
        color_index: 1,
        order_index: 9999,
        is_external: categoryId === 'external',
      });
    }
    return {
      id: docSnap.id,
      label: data.label || '',
      icon: data.icon || 'fa-solid fa-link',
      url: data.url || '#',
      category_id: categoryId || 'external',
      parent_id: data.parentId || null,
      order_index: numberOr(data.order, 0),
      category_order: numberOr(data.categoryOrder, 0),
      is_external_tool: !!data.isExternalTool,
    };
  }).sort((a, b) => numberOr(a.parent_id ? 1 : 0, 0) - numberOr(b.parent_id ? 1 : 0, 0));

  const noticeRows = noticeSnap.docs.map(docSnap => {
    const data = docSnap.data() || {};
    return {
      id: docSnap.id,
      title: data.title || '',
      body: data.body || '',
      priority: data.priority || 'normal',
      target_scope: data.targetScope || 'all',
      target_departments: textList(data.targetDepartments),
      require_acknowledgement: !!data.requireAcknowledgement,
      acknowledged_by: textList(data.acknowledgedBy),
      created_by: data.createdBy || '',
      created_at: isoOrNow(data.createdAt),
      updated_at: toIsoTimestamp(data.updatedAt) || isoOrNow(data.createdAt),
    };
  });
  const knownNoticeIds = new Set(noticeRows.map(row => row.id));

  const noticeReactionRows = [];
  reactionSnap.docs.forEach(docSnap => {
    if (!knownNoticeIds.has(docSnap.id)) return;
    const reactionMap = plainObject(docSnap.data());
    Object.entries(reactionMap).forEach(([emoji, usernames]) => {
      textList(usernames).forEach(username => {
        noticeReactionRows.push({
          notice_id: docSnap.id,
          emoji,
          username,
        });
      });
    });
  });

  await bulkUpsert(report, 'public_categories', categoryRows, { onConflict: 'id' });
  await bulkUpsert(report, 'public_cards', cardRows, { onConflict: 'id' });
  await bulkUpsert(report, 'notices', noticeRows, { onConflict: 'id' });
  await bulkUpsert(report, 'notice_reactions', noticeReactionRows, {
    mode: 'ignore-duplicates',
  });

  return {
    noticeIds: new Set(noticeRows.map(row => row.id)),
  };
}

async function migrateUserScopedData(username, noticeIds, report) {
  logProgress(`Migrating user data: ${username}`);
  const [
    prefSnap,
    profileSnap,
    lockSnap,
    sectionOrderSnap,
    chatReadsSnap,
    driveLinkSnap,
    driveContactsSnap,
    privateSectionSnap,
    privateCardSnap,
    todoSnap,
    readNoticeSnap,
    attendanceSnap,
    emailContactSnap,
  ] = await Promise.all([
    getDoc(doc(db, 'users', username, 'data', 'preferences')),
    getDoc(doc(db, 'users', username, 'data', 'email_profile')),
    getDoc(doc(db, 'users', username, 'data', 'lock_pin')),
    getDoc(doc(db, 'users', username, 'data', 'section_order')),
    getDoc(doc(db, 'users', username, 'data', 'chat_reads')),
    getDoc(doc(db, 'users', username, 'data', 'drive_link')),
    getDoc(doc(db, 'users', username, 'data', 'drive_contacts')),
    getDocs(collection(db, 'users', username, 'private_sections')),
    getDocs(collection(db, 'users', username, 'private_cards')),
    getDocs(collection(db, 'users', username, 'todos')),
    getDocs(collection(db, 'users', username, 'read_notices')),
    getDocs(collection(db, 'users', username, 'attendance')),
    getDocs(collection(db, 'users', username, 'email_contacts')),
  ]);

  if (prefSnap.exists()) {
    const data = prefSnap.data() || {};
    await bulkUpsert(report, 'user_preferences', [{
      username,
      theme: data.theme || 'dark',
      font_size: data.fontSize || 'font-md',
      fav_only: !!data.favOnly,
      favorites: textList(data.favorites),
      collapsed_sections: textList(data.collapsedSections),
      collapse_seeded: !!data.collapseSeeded,
      hidden_cards: textList(data.hiddenCards),
      mission_banner_hidden: !!data.missionBannerHidden,
      last_viewed_suggestions_at: toIsoTimestamp(data.lastViewedSuggestionsAt),
    }], { onConflict: 'username' });
  }

  if (profileSnap.exists()) {
    const data = profileSnap.data() || {};
    await bulkUpsert(report, 'user_profiles', [{
      username,
      real_name: data.realName || '',
      department: data.department || '',
      role_type: data.roleType || 'member',
      email: data.email || '',
      phone: data.phone || '',
      signature_template: data.signatureTemplate || '',
    }], { onConflict: 'username' });
  }

  if (lockSnap.exists()) {
    const data = lockSnap.data() || {};
    await bulkUpsert(report, 'user_lock_pins', [{
      username,
      enabled: !!data.enabled,
      hash: data.hash || null,
      auto_lock_minutes: numberOr(data.autoLockMinutes, 5),
    }], { onConflict: 'username' });
  }

  if (sectionOrderSnap.exists()) {
    const data = sectionOrderSnap.data() || {};
    await bulkUpsert(report, 'user_section_orders', [{
      username,
      order_ids: textList(data.order),
    }], { onConflict: 'username' });
  }

  if (chatReadsSnap.exists()) {
    const data = plainObject(chatReadsSnap.data());
    const rows = Object.entries(data).map(([roomKey, readAt]) => ({
      username,
      room_key: roomKey,
      read_at: isoOrNow(readAt),
    }));
    await bulkUpsert(report, 'user_chat_reads', rows);
  }

  if (driveLinkSnap.exists()) {
    const data = driveLinkSnap.data() || {};
    await bulkUpsert(report, 'user_drive_links', [{
      username,
      url: data.url || '',
    }], { onConflict: 'username' });
  }

  if (driveContactsSnap.exists()) {
    const contacts = normalizeDriveContactsMap(driveContactsSnap.data());
    const rows = Object.entries(contacts).map(([contactUsername, entry]) => ({
      username,
      contact_username: contactUsername,
      url: entry.url || '',
      saved_at: toIsoTimestamp(entry.savedAt),
    }));
    await bulkUpsert(report, 'user_drive_contacts', rows);
  }

  const privateSectionRows = privateSectionSnap.docs.map(docSnap => {
    const data = docSnap.data() || {};
    return {
      id: docSnap.id,
      username,
      label: data.label || '',
      icon: data.icon || 'fa-solid fa-star',
      color_index: numberOr(data.colorIndex, 1),
      order_index: numberOr(data.order, 0),
    };
  });
  const knownSectionIds = new Set(privateSectionRows.map(row => row.id));
  const privateCardRows = privateCardSnap.docs.map(docSnap => {
    const data = docSnap.data() || {};
    const sectionId = `${data.sectionId || ''}`.trim();
    if (sectionId && !knownSectionIds.has(sectionId)) {
      knownSectionIds.add(sectionId);
      privateSectionRows.push({
        id: sectionId,
        username,
        label: sectionId,
        icon: 'fa-solid fa-star',
        color_index: 1,
        order_index: 9999,
      });
    }
    return {
      id: docSnap.id,
      username,
      label: data.label || '',
      icon: data.icon || 'fa-solid fa-link',
      url: data.url || '#',
      section_id: sectionId || null,
      parent_id: data.parentId || null,
      order_index: numberOr(data.order, 0),
    };
  }).sort((a, b) => numberOr(a.parent_id ? 1 : 0, 0) - numberOr(b.parent_id ? 1 : 0, 0));

  await bulkUpsert(report, 'private_sections', privateSectionRows, { onConflict: 'id' });
  await bulkUpsert(report, 'private_cards', privateCardRows, { onConflict: 'id' });

  const todoRows = todoSnap.docs.map(docSnap => {
    const data = docSnap.data() || {};
    return {
      id: docSnap.id,
      username,
      text: data.text || '',
      done: !!data.done,
      due_date: data.dueDate || null,
      created_at: isoOrNow(data.createdAt),
      updated_at: toIsoTimestamp(data.updatedAt) || toIsoTimestamp(data.createdAt),
    };
  });
  await bulkUpsert(report, 'user_todos', todoRows, { onConflict: 'id' });

  const readNoticeRows = readNoticeSnap.docs
    .filter(docSnap => !noticeIds || noticeIds.has(docSnap.id))
    .map(docSnap => {
      const data = docSnap.data() || {};
      return {
        username,
        notice_id: docSnap.id,
        read_at: isoOrNow(data.readAt),
      };
    });
  await bulkUpsert(report, 'user_notice_reads', readNoticeRows, {
    mode: 'ignore-duplicates',
  });

  const attendanceRows = attendanceSnap.docs.map(docSnap => {
    const data = docSnap.data() || {};
    return {
      username,
      entry_date: docSnap.id,
      type: data.type || null,
      hayade: data.hayade || null,
      zangyo: data.zangyo || null,
      note: data.note || null,
      work_site_hours: plainObject(data.workSiteHours),
      project_keys: textList(data.projectKeys),
      year_month: data.yearMonth || docSnap.id.slice(0, 7),
      updated_at: toIsoTimestamp(data.updatedAt),
    };
  });
  await bulkUpsert(report, 'attendance_entries', attendanceRows, {
  });

  const emailContactRows = emailContactSnap.docs.map(docSnap => {
    const data = docSnap.data() || {};
    return {
      contact_id: docSnap.id,
      username,
      company_name: data.companyName || '',
      person_name: data.personName || '',
      created_at: isoOrNow(data.createdAt),
      updated_at: toIsoTimestamp(data.updatedAt) || toIsoTimestamp(data.createdAt),
    };
  });
  await bulkUpsert(report, 'user_email_contacts', emailContactRows, {
  });
}

async function migrateRequests(report) {
  logProgress('Migrating requests and suggestions');
  const [requestSnap, suggestionSnap] = await Promise.all([
    getDocs(collection(db, 'cross_dept_requests')),
    getDocs(collection(db, 'suggestion_box')),
  ]);

  const requestRows = requestSnap.docs.map(docSnap => {
    const data = docSnap.data() || {};
    return {
      id: docSnap.id,
      title: data.title || '',
      project_key: data.projectKey || '',
      to_dept: data.toDept || '',
      from_dept: data.fromDept || '',
      content: data.content || '',
      proposal: data.proposal || '',
      remarks: data.remarks || '',
      status: data.status || 'submitted',
      created_by: data.createdBy || '',
      status_note: data.statusNote || '',
      status_updated_by: data.statusUpdatedBy || '',
      archived: !!data.archived,
      notify_creator: !!data.notifyCreator,
      linked_task_id: data.linkedTaskId || null,
      linked_task_status: data.linkedTaskStatus || null,
      linked_task_assigned_to: data.linkedTaskAssignedTo || null,
      linked_task_linked_by: data.linkedTaskLinkedBy || null,
      linked_task_linked_at: toIsoTimestamp(data.linkedTaskLinkedAt),
      linked_task_closed_at: toIsoTimestamp(data.linkedTaskClosedAt),
      created_at: isoOrNow(data.createdAt),
      updated_at: toIsoTimestamp(data.updatedAt) || isoOrNow(data.createdAt),
    };
  });

  const suggestionRows = suggestionSnap.docs.map(docSnap => {
    const data = docSnap.data() || {};
    return {
      id: docSnap.id,
      content: data.content || '',
      created_by: data.createdBy || data.author || 'anonymous',
      is_anonymous: !!data.isAnonymous,
      archived: !!data.archived,
      admin_reply: data.adminReply || null,
      replied_by: data.repliedBy || null,
      replied_at: toIsoTimestamp(data.repliedAt),
      created_at: isoOrNow(data.createdAt),
      category: data.category || 'other',
    };
  });

  await bulkUpsert(report, 'cross_dept_requests', requestRows, { onConflict: 'id' });
  await bulkUpsert(report, 'suggestion_box', suggestionRows, { onConflict: 'id' });
  return new Set(requestRows.map(row => row.id));
}

async function migrateTasks(report, requestIds) {
  logProgress('Migrating tasks');
  const snap = await getDocs(collection(db, 'assigned_tasks'));
  const rows = snap.docs.map(docSnap => {
    const data = docSnap.data() || {};
    const sourceRequestId = data.sourceRequestId && requestIds.has(data.sourceRequestId)
      ? data.sourceRequestId
      : null;
    return {
      id: docSnap.id,
      title: data.title || '',
      description: data.description || '',
      assigned_by: data.assignedBy || '',
      assigned_to: data.assignedTo || '',
      status: data.status || 'pending',
      due_date: data.dueDate || '',
      project_key: data.projectKey || '',
      source_type: data.sourceType || 'manual',
      source_request_id: sourceRequestId,
      source_request_from_dept: data.sourceRequestFromDept || null,
      source_request_to_dept: data.sourceRequestToDept || null,
      notified_done: !!data.notifiedDone,
      shared_with: textList(data.sharedWith),
      shared_responses: plainObject(data.sharedResponses),
      accepted_at: toIsoTimestamp(data.acceptedAt),
      done_at: toIsoTimestamp(data.doneAt),
      created_at: isoOrNow(data.createdAt),
      updated_at: toIsoTimestamp(data.updatedAt) || toIsoTimestamp(data.doneAt) || toIsoTimestamp(data.acceptedAt) || isoOrNow(data.createdAt),
    };
  });
  await bulkUpsert(report, 'assigned_tasks', rows, { onConflict: 'id' });
}

async function migrateAttendanceSupport(report) {
  logProgress('Migrating attendance support tables');
  const [siteSnap, companyConfigSnap, publicAttendanceSnap] = await Promise.all([
    getDocs(collection(db, 'attendance_sites')),
    getDoc(doc(db, 'company_calendar', 'config')),
    getDocs(collection(db, 'public_attendance')),
  ]);

  const siteRows = siteSnap.docs.map(docSnap => {
    const data = docSnap.data() || {};
    return {
      id: docSnap.id,
      code: data.code || '',
      name: data.name || '',
      sort_order: numberOr(data.sortOrder, 0),
      active: data.active !== false,
      updated_by: data.updatedBy || '',
    };
  });
  await bulkUpsert(report, 'attendance_sites', siteRows, { onConflict: 'id' });

  if (companyConfigSnap.exists()) {
    const data = companyConfigSnap.data() || {};
    await bulkUpsert(report, 'company_calendar_settings', [{
      id: 'default',
      work_saturdays: textList(data.workSaturdays),
      planned_leave_saturdays: textList(data.plannedLeaveSaturdays),
      holiday_ranges: Array.isArray(data.holidayRanges) ? data.holidayRanges : [],
      events: Array.isArray(data.events) ? data.events : [],
    }], { onConflict: 'id' });
  }

  const publicAttendanceRows = publicAttendanceSnap.docs.map(docSnap => ({
    year_month: docSnap.id,
    days: plainObject(docSnap.data()),
  }));
  await bulkUpsert(report, 'public_attendance_months', publicAttendanceRows, {
    onConflict: 'year_month',
  });
}

async function migrateOrders(report) {
  logProgress('Migrating order tables');
  const [supplierSnap, itemSnap, orderSnap] = await Promise.all([
    getDocs(collection(db, 'order_suppliers')),
    getDocs(collection(db, 'order_items')),
    getDocs(collection(db, 'orders')),
  ]);

  const supplierRows = supplierSnap.docs.map(docSnap => {
    const data = docSnap.data() || {};
    return {
      id: docSnap.id,
      name: data.name || '',
      email: data.email || '',
      tel: data.tel || '',
      address: data.address || '',
      active: data.active !== false,
    };
  });
  const supplierIds = new Set(supplierRows.map(row => row.id));
  const itemRows = itemSnap.docs.map(docSnap => {
    const data = docSnap.data() || {};
    const supplierId = data.supplierId && supplierIds.has(data.supplierId) ? data.supplierId : null;
    return {
      id: docSnap.id,
      supplier_id: supplierId,
      item_category: data.itemCategory || '',
      name: data.name || '',
      spec: data.spec || '',
      unit: data.unit || '',
      default_qty: numberOr(data.defaultQty, 1),
      order_type: data.orderType || 'both',
      material_type: data.materialType || 'steel',
      available_lengths: textList(data.availableLengths),
      sort_order: numberOr(data.sortOrder, 0),
      active: data.active !== false,
    };
  });
  const orderRows = orderSnap.docs.map(docSnap => {
    const data = docSnap.data() || {};
    const supplierId = data.supplierId && supplierIds.has(data.supplierId) ? data.supplierId : null;
    return {
      id: docSnap.id,
      supplier_id: supplierId,
      supplier_name: data.supplierName || '',
      supplier_email: data.supplierEmail || '',
      order_type: data.orderType || 'factory',
      site_name: data.siteName || null,
      project_key: data.projectKey || '',
      items: Array.isArray(data.items) ? data.items : [],
      ordered_by: data.orderedBy || '',
      note: data.note || '',
      ordered_at: isoOrNow(data.orderedAt),
      email_sent: !!data.emailSent,
      email_sent_at: toIsoTimestamp(data.emailSentAt),
      deleted_at: toIsoTimestamp(data.deletedAt),
      deleted_by: data.deletedBy || null,
    };
  });

  await bulkUpsert(report, 'order_suppliers', supplierRows, { onConflict: 'id' });
  await bulkUpsert(report, 'order_items', itemRows, { onConflict: 'id' });
  await bulkUpsert(report, 'orders', orderRows, { onConflict: 'id' });
}

async function migrateDriveAndSignals(report) {
  logProgress('Migrating drive shares and P2P signals');
  const [driveShareSnap, signalSnap] = await Promise.all([
    getDocs(collection(db, 'drive_shares')),
    getDocs(collection(db, 'p2p_signals')),
  ]);

  const driveRows = driveShareSnap.docs.map(docSnap => {
    const data = docSnap.data() || {};
    return {
      id: docSnap.id,
      from: data.from || '',
      to: data.to || '',
      drive_url: data.driveUrl || '',
      message: data.message || '',
      status: data.status || 'pending',
      viewed_at: toIsoTimestamp(data.viewedAt),
      created_at: isoOrNow(data.createdAt),
    };
  });
  const signalRows = signalSnap.docs.map(docSnap => {
    const data = docSnap.data() || {};
    return {
      id: docSnap.id,
      from: data.from || '',
      to: data.to || '',
      file_name: data.fileName || '',
      file_size: numberOr(data.fileSize, 0),
      file_type: data.fileType || '',
      status: data.status || 'pending',
      offer: data.offer || null,
      answer: data.answer || null,
      from_candidates: textList(data.fromCandidates),
      to_candidates: textList(data.toCandidates),
      created_at: isoOrNow(data.createdAt),
    };
  });

  await bulkUpsert(report, 'drive_shares', driveRows, { onConflict: 'id' });
  await bulkUpsert(report, 'p2p_signals', signalRows, { onConflict: 'id' });
}

async function migrateChat(report) {
  logProgress('Migrating chat rooms and messages');
  const [dmRoomSnap, groupRoomSnap] = await Promise.all([
    getDocs(collection(db, 'dm_rooms')),
    getDocs(collection(db, 'chat_rooms')),
  ]);

  const roomRows = [];
  const messageRows = [];

  for (const docSnap of dmRoomSnap.docs) {
    const data = docSnap.data() || {};
    roomRows.push({
      id: docSnap.id,
      type: 'dm',
      name: data.name || '',
      members: textList(data.members),
      created_by: data.createdBy || '',
      last_message: data.lastMessage || '',
      last_at: toIsoTimestamp(data.lastAt),
      last_sender: data.lastSender || '',
      created_at: isoOrNow(data.createdAt),
    });

    const messageSnap = await getDocs(collection(db, 'dm_rooms', docSnap.id, 'messages'));
    messageSnap.docs.forEach(messageDoc => {
      const message = messageDoc.data() || {};
      messageRows.push({
        id: messageDoc.id,
        room_id: docSnap.id,
        username: message.username || '',
        text: message.text || '',
        created_at: isoOrNow(message.createdAt),
      });
    });
  }

  for (const docSnap of groupRoomSnap.docs) {
    const data = docSnap.data() || {};
    roomRows.push({
      id: docSnap.id,
      type: 'group',
      name: data.name || '',
      members: textList(data.members),
      created_by: data.createdBy || '',
      last_message: data.lastMessage || '',
      last_at: toIsoTimestamp(data.lastAt),
      last_sender: data.lastSender || '',
      created_at: isoOrNow(data.createdAt),
    });

    const messageSnap = await getDocs(collection(db, 'chat_rooms', docSnap.id, 'messages'));
    messageSnap.docs.forEach(messageDoc => {
      const message = messageDoc.data() || {};
      messageRows.push({
        id: messageDoc.id,
        room_id: docSnap.id,
        username: message.username || '',
        text: message.text || '',
        created_at: isoOrNow(message.createdAt),
      });
    });
  }

  await bulkUpsert(report, 'chat_rooms', roomRows, { onConflict: 'id' });
  await bulkUpsert(report, 'chat_messages', messageRows, { onConflict: 'id' });
}

export async function runFirebaseCutoverToSupabase(options = {}) {
  if (options.onProgress) deps.onProgress = options.onProgress;

  const stored = loadSupabaseConfigFromStorage();
  if (stored) applySupabaseRuntimeConfig(stored);
  if (!isSupabaseSharedCoreEnabled()) {
    throw new Error('Supabase runtime config is not available.');
  }

  const report = {
    startedAt: new Date().toISOString(),
    finishedAt: null,
    usernames: [],
    tables: {},
  };

  await migratePortalConfig(report);
  const usernames = await migrateUserAccounts(report);
  const { noticeIds } = await migrateSharedCore(report);

  for (const username of usernames) {
    await migrateUserScopedData(username, noticeIds, report);
  }

  const requestIds = await migrateRequests(report);
  await migrateTasks(report, requestIds);
  await migrateAttendanceSupport(report);
  await migrateOrders(report);
  await migrateDriveAndSignals(report);
  await migrateChat(report);

  report.finishedAt = new Date().toISOString();
  logProgress('Firebase cutover finished');
  return report;
}

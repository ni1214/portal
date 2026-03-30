// ========== 認証・ユーザー管理・ロック画面 ==========
import { db, doc, getDoc, setDoc, getDocs, updateDoc, collection, query, where, writeBatch, serverTimestamp } from './config.js';
import { state } from './state.js';
import {
  applySupabaseRuntimeConfig,
  isSupabaseSharedCoreEnabled,
  loadSupabaseConfigFromStorage,
  fetchPortalConfigFromSupabase,
  savePortalConfigToSupabase,
  checkUserExistsInSupabase,
  registerUserLoginInSupabase,
  getUserLockPinFromSupabase,
  saveLockPinToSupabase,
  fetchAllUserAccountsFromSupabase,
  deleteUserFromSupabase,
  migrateUsernameInSupabase,
  fetchPrivateSectionsFromSupabase,
  fetchPrivateCardsFromSupabase,
  createPrivateSectionInSupabase,
  createPrivateCardInSupabase,
  deletePrivateSectionInSupabase,
  deletePrivateCardInSupabase,
} from './supabase.js';
import { showToast, showConfirm } from './notify.js';

// Cross-module function references (set by script.js after all modules load)
export const deps = {};

let inviteGateResolver = null;
let preLoginContext = null;
const INVITE_SESSION_KEY = 'portal-invite-ok';
const INVITE_TRUST_KEY = 'portal-invite-trusted';
// Trusted-device invite access should expire to reduce shared-device risk.
// Keep UX: once trusted, it stays trusted for a while without re-entering the code.
const INVITE_TRUST_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ========== PIN 認証 ==========
const PIN_SALT = 'seisan-portal-v1';

export async function hashPIN(pin) {
  const data = new TextEncoder().encode(pin + PIN_SALT);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPIN(pin) {
  if (isSupabaseSharedCoreEnabled()) {
    try {
      const data = await fetchPortalConfigFromSupabase();
      if (!data.pinHash) return false;
      return (await hashPIN(pin)) === data.pinHash;
    } catch (_) {
      return false;
    }
  }
  const snap = await getDoc(doc(db, 'portal', 'config'));
  if (!snap.exists() || !snap.data().pinHash) return false;
  return (await hashPIN(pin)) === snap.data().pinHash;
}

export async function setPIN(pin) {
  const hash = await hashPIN(pin);
  if (isSupabaseSharedCoreEnabled()) {
    await savePortalConfigToSupabase({ pinHash: hash });
    return;
  }
  await setDoc(doc(db, 'portal', 'config'), { pinHash: hash }, { merge: true });
}

export async function isPINConfigured() {
  if (isSupabaseSharedCoreEnabled()) {
    try {
      const data = await fetchPortalConfigFromSupabase();
      return !!data.pinHash;
    } catch (_) {
      return false;
    }
  }
  const snap = await getDoc(doc(db, 'portal', 'config'));
  return snap.exists() && !!snap.data().pinHash;
}

export async function loadInviteCodeConfig() {
  // まずlocalStorageからSupabase接続情報を復元
  const stored = loadSupabaseConfigFromStorage();
  if (stored) applySupabaseRuntimeConfig(stored);
  if (isSupabaseSharedCoreEnabled()) {
    try {
      const data = await fetchPortalConfigFromSupabase();
      state.inviteCodeHash = data.inviteCodeHash || null;
      state.inviteCodePlain = data.inviteCodePlain || '';
      state.inviteCodeRequired = !!state.inviteCodeHash;
      state.adminInviteConfigured = state.inviteCodeRequired;
      updateInviteAdminState();
      return data;
    } catch (err) {
      console.error('Supabase invite config load error:', err);
      showToast('招待コード設定を読み込めませんでした。', 'error');
      return {};
    }
  }
  return {};
}

function getInviteTrustExpiryMs() {
  const raw = localStorage.getItem(INVITE_TRUST_KEY);
  if (!raw) return 0;

  // Back-compat: legacy value was "1" (never expired). Migrate to TTL on first read.
  if (raw === '1') {
    const exp = Date.now() + INVITE_TRUST_TTL_MS;
    localStorage.setItem(INVITE_TRUST_KEY, String(exp));
    return exp;
  }

  const exp = Number(raw);
  return Number.isFinite(exp) ? exp : 0;
}

function hasTrustedInviteAccess() {
  const exp = getInviteTrustExpiryMs();
  if (!exp) return false;
  if (Date.now() > exp) {
    localStorage.removeItem(INVITE_TRUST_KEY);
    return false;
  }
  return true;
}

function markInviteSessionVerified() {
  state.inviteCodeVerified = true;
  sessionStorage.setItem(INVITE_SESSION_KEY, '1');
}

function trustInviteAccessForDevice() {
  markInviteSessionVerified();
  localStorage.setItem(INVITE_TRUST_KEY, String(Date.now() + INVITE_TRUST_TTL_MS));
}

function refreshInviteVerifiedState() {
  state.inviteCodeVerified = sessionStorage.getItem(INVITE_SESSION_KEY) === '1' || hasTrustedInviteAccess();
}

function isMobilePreloginExemptDevice() {
  if (typeof window === 'undefined') return false;
  const isNarrowViewport = window.matchMedia?.('(max-width: 768px)')?.matches ?? window.innerWidth <= 768;
  const hasTouchLikeInput = (navigator.maxTouchPoints || 0) > 0
    || (window.matchMedia?.('(pointer: coarse)')?.matches ?? false);
  return isNarrowViewport && hasTouchLikeInput;
}

function hideInviteError() {
  const box = document.getElementById('auth-invite-error');
  if (box) {
    box.hidden = true;
    box.textContent = '';
  }
}

function showInviteError(message) {
  const box = document.getElementById('auth-invite-error');
  if (!box) return;
  box.textContent = message;
  box.hidden = false;
}

function setInviteSubmitBusy(isBusy) {
  const submitBtn = document.getElementById('auth-invite-submit');
  const spinner = document.getElementById('auth-invite-spinner');
  if (submitBtn) submitBtn.disabled = isBusy;
  if (spinner) spinner.hidden = !isBusy;
}

function openInviteModal() {
  const modal = document.getElementById('auth-invite-modal');
  const input = document.getElementById('auth-invite-input');
  if (!modal || !input) return;
  input.value = '';
  hideInviteError();
  setInviteSubmitBusy(false);
  modal.classList.add('visible');
  setTimeout(() => input.focus(), 80);
}

export function openInviteCodeModal() {
  openInviteModal();
}

export function closeInviteModal() {
  document.getElementById('auth-invite-modal')?.classList.remove('visible');
}

export async function ensureInviteAccess() {
  try {
    await loadInviteCodeConfig();
  } catch (err) {
    console.error('招待コード設定の読込に失敗しました:', err);
    openInviteModal();
    showInviteError('招待コード設定を読めませんでした。再読み込みしてください。');
    setInviteSubmitBusy(true);
    return false;
  }

  refreshInviteVerifiedState();

  if (!state.inviteCodeRequired) {
    state.inviteCodeVerified = true;
    sessionStorage.removeItem(INVITE_SESSION_KEY);
    closeInviteModal();
    return true;
  }

  if (state.inviteCodeVerified) {
    markInviteSessionVerified();
    closeInviteModal();
    return true;
  }

  openInviteModal();
  return new Promise(resolve => {
    inviteGateResolver = resolve;
  });
}

export async function submitInviteCode(code) {
  const normalized = `${code || ''}`.trim();
  if (!/^\d{4}$/.test(normalized)) {
    showInviteError('4桁の招待コードを入力してください。');
    return false;
  }
  if (!state.inviteCodeHash) {
    showInviteError('招待コード設定が読み込めていません。再読み込みしてください。');
    return false;
  }

  setInviteSubmitBusy(true);
  hideInviteError();
  try {
    const hash = await hashPIN(normalized);
    if (hash !== state.inviteCodeHash) {
      showInviteError('招待コードが違います。');
      return false;
    }
    markInviteSessionVerified();
    closeInviteModal();
    if (inviteGateResolver) {
      inviteGateResolver(true);
      inviteGateResolver = null;
    }
    return true;
  } finally {
    setInviteSubmitBusy(false);
  }
}

function updateInviteAdminState(message = '') {
  const statusEl = document.getElementById('admin-invite-status');
  const hintEl = document.getElementById('admin-invite-hint');
  const clearBtn = document.getElementById('admin-invite-clear-btn');
  const input = document.getElementById('admin-invite-input');
  const currentWrap = document.getElementById('admin-invite-current-wrap');
  const currentCode = document.getElementById('admin-invite-current-code');
  if (statusEl) {
    statusEl.textContent = state.adminInviteConfigured ? '設定済み' : '未設定';
    statusEl.classList.toggle('is-configured', state.adminInviteConfigured);
  }
  if (hintEl) {
    hintEl.textContent = message || (state.adminInviteConfigured
      ? (state.inviteCodePlain
        ? '現在は未承認端末のみ、最初に招待コード入力後ログイン画面へ進みます。'
        : '現在のコードは旧設定のため再表示できません。次回保存分からここに表示されます。')
      : '未設定の間は招待コードなしでログイン画面へ進みます。');
  }
  if (clearBtn) clearBtn.hidden = !state.adminInviteConfigured;
  if (input) input.value = '';
  if (currentWrap) currentWrap.hidden = !state.adminInviteConfigured;
  if (currentCode) currentCode.textContent = state.inviteCodePlain || '再表示不可';
}

export async function saveInviteCode(code) {
  const normalized = `${code || ''}`.trim();
  if (!/^\d{4}$/.test(normalized)) {
    throw new Error('4桁の数字を入力してください。');
  }
  const hash = await hashPIN(normalized);
  if (isSupabaseSharedCoreEnabled()) {
    await savePortalConfigToSupabase({
      inviteCodeHash: hash,
      inviteCodePlain: normalized,
      inviteUpdatedAt: new Date().toISOString(),
    });
  } else {
    await setDoc(doc(db, 'portal', 'config'), {
      inviteCodeHash: hash,
      inviteCodePlain: normalized,
      inviteUpdatedAt: serverTimestamp(),
    }, { merge: true });
  }
  state.inviteCodeHash = hash;
  state.inviteCodePlain = normalized;
  state.inviteCodeRequired = true;
  state.adminInviteConfigured = true;
  updateInviteAdminState('招待コードを保存しました。未承認端末の次回アクセスから有効です。');
}

export async function clearInviteCode() {
  if (isSupabaseSharedCoreEnabled()) {
    await savePortalConfigToSupabase({
      inviteCodeHash: null,
      inviteCodePlain: null,
      inviteUpdatedAt: new Date().toISOString(),
    });
  } else {
    await setDoc(doc(db, 'portal', 'config'), {
      inviteCodeHash: null,
      inviteCodePlain: null,
      inviteUpdatedAt: serverTimestamp(),
    }, { merge: true });
  }
  state.inviteCodeHash = null;
  state.inviteCodePlain = '';
  state.inviteCodeRequired = false;
  state.adminInviteConfigured = false;
  state.inviteCodeVerified = true;
  sessionStorage.removeItem(INVITE_SESSION_KEY);
  updateInviteAdminState('招待コードを解除しました。URLを知っていればログイン画面へ進めます。');
}

// ========== ユーザー（ニックネーム）管理 ==========

/**
 * 旧ユーザー名から新ユーザー名へ全データを移行する
 * - users/{old}/data/ サブドキュメント
 * - users/{old}/private_sections/
 * - users/{old}/private_cards/
 * - users_list エントリ
 * - assigned_tasks の assignedTo / assignedBy
 * - dm_rooms / chat_rooms の members 配列
 */
export async function migrateToNewUsername(oldName, newName) {
  if (isSupabaseSharedCoreEnabled()) {
    return migrateUsernameInSupabase(oldName, newName);
  }

  const batch = writeBatch(db);

  // 1. data サブドキュメントをコピー
  const dataDocIds = ['preferences', 'section_order', 'lock_pin', 'chat_reads'];
  for (const docId of dataDocIds) {
    try {
      const snap = await getDoc(doc(db, 'users', oldName, 'data', docId));
      if (snap.exists()) {
        batch.set(doc(db, 'users', newName, 'data', docId), snap.data());
        batch.delete(doc(db, 'users', oldName, 'data', docId));
      }
    } catch (_) {}
  }

  // 2. private_sections をコピー
  if (isSupabaseSharedCoreEnabled()) {
    try {
      const sections = await fetchPrivateSectionsFromSupabase(oldName);
      await Promise.all(sections.map(async s => {
        await createPrivateSectionInSupabase(newName, s);
        await deletePrivateSectionInSupabase(s.id);
      }));
    } catch (_) {}
  } else {
    try {
      const psSnap = await getDocs(collection(db, 'users', oldName, 'private_sections'));
      psSnap.forEach(d => {
        batch.set(doc(db, 'users', newName, 'private_sections', d.id), d.data());
        batch.delete(doc(db, 'users', oldName, 'private_sections', d.id));
      });
    } catch (_) {}
  }

  // 3. private_cards をコピー
  if (isSupabaseSharedCoreEnabled()) {
    try {
      const cards = await fetchPrivateCardsFromSupabase(oldName);
      await Promise.all(cards.map(async c => {
        await createPrivateCardInSupabase(newName, c);
        await deletePrivateCardInSupabase(c.id);
      }));
    } catch (_) {}
  } else {
    try {
      const pcSnap = await getDocs(collection(db, 'users', oldName, 'private_cards'));
      pcSnap.forEach(d => {
        batch.set(doc(db, 'users', newName, 'private_cards', d.id), d.data());
        batch.delete(doc(db, 'users', oldName, 'private_cards', d.id));
      });
    } catch (_) {}
  }

  // 4. users_list を更新（旧削除 → 新作成）
  batch.delete(doc(db, 'users_list', oldName));
  batch.set(doc(db, 'users_list', newName), {
    displayName: newName,
    createdAt: serverTimestamp(),
    lastLogin: serverTimestamp(),
  });

  await batch.commit();

  // 5. assigned_tasks: assignedTo を更新
  try {
    const tasksTo = await getDocs(query(collection(db, 'assigned_tasks'), where('assignedTo', '==', oldName)));
    if (!tasksTo.empty) {
      const b2 = writeBatch(db);
      tasksTo.forEach(d => b2.update(d.ref, { assignedTo: newName }));
      await b2.commit();
    }
  } catch (_) {}

  // 6. assigned_tasks: assignedBy を更新
  try {
    const tasksBy = await getDocs(query(collection(db, 'assigned_tasks'), where('assignedBy', '==', oldName)));
    if (!tasksBy.empty) {
      const b3 = writeBatch(db);
      tasksBy.forEach(d => b3.update(d.ref, { assignedBy: newName }));
      await b3.commit();
    }
  } catch (_) {}

  // 7. dm_rooms: members 配列を更新
  try {
    const dmSnap = await getDocs(query(collection(db, 'dm_rooms'), where('members', 'array-contains', oldName)));
    if (!dmSnap.empty) {
      const b4 = writeBatch(db);
      dmSnap.forEach(d => {
        const members = (d.data().members || []).map(m => m === oldName ? newName : m);
        b4.update(d.ref, { members });
      });
      await b4.commit();
    }
  } catch (_) {}

  // 8. chat_rooms: members / createdBy を更新
  try {
    const crSnap = await getDocs(query(collection(db, 'chat_rooms'), where('members', 'array-contains', oldName)));
    if (!crSnap.empty) {
      const b5 = writeBatch(db);
      crSnap.forEach(d => {
        const members = (d.data().members || []).map(m => m === oldName ? newName : m);
        const updates = { members };
        if (d.data().createdBy === oldName) updates.createdBy = newName;
        b5.update(d.ref, updates);
      });
      await b5.commit();
    }
  } catch (_) {}
}

export function showUsernameModal(isEdit = false) {
  const input = document.getElementById('username-input');
  input.value = (isEdit && state.currentUsername) ? state.currentUsername : '';
  document.getElementById('username-modal').classList.add('visible');
  // セキュリティ設定ボタンはログイン済みのときのみ表示
  document.getElementById('username-security-row').hidden = !state.currentUsername;
  hideUsernameError();

  // 編集モード（ログイン済み）かどうかでテキストを切り替え
  if (isEdit && state.currentUsername) {
    document.getElementById('username-modal-title').innerHTML =
      '<i class="fa-solid fa-user-circle"></i> ユーザーネームを変更';
    document.getElementById('username-modal-desc').innerHTML =
      '新しいユーザーネームを入力してください。<br>チャット・タスク・マイカテゴリなどのデータはすべて引き継がれます。';
    document.getElementById('username-submit-text').textContent = '変更する';
    document.getElementById('username-skip').textContent = 'キャンセル';
  } else {
    document.getElementById('username-modal-title').innerHTML =
      '<i class="fa-solid fa-user-circle"></i> ユーザーネームを設定';
    document.getElementById('username-modal-desc').innerHTML =
      'あなただけの名前を入力してください。<br>お気に入り・テーマ・マイカテゴリがこの名前に紐づいて保存されます。';
    document.getElementById('username-submit-text').textContent = '設定して始める';
    document.getElementById('username-skip').textContent = 'スキップ';
  }

  setTimeout(() => input.focus(), 100);
}

export function closeUsernameModal() {
  document.getElementById('username-modal').classList.remove('visible');
}

export function showUsernameError(msg) {
  const box = document.getElementById('username-error-box');
  document.getElementById('username-error-msg').textContent = msg;
  box.hidden = false;
}

export function hideUsernameError() {
  document.getElementById('username-error-box').hidden = true;
  document.getElementById('username-reclaim').hidden = true;
}

export async function applyUsername(name, options = {}) {
  const recommendLockSetup = !!options.recommendLockSetup;
  const lockPromptMessage = options.lockPromptMessage || 'なりすまし防止のため、PINロック設定をおすすめします。';
  const isSwitch = !!state.currentUsername && state.currentUsername !== name;
  state.currentUsername = name;
  localStorage.setItem('portal-username', name);
  if (state.inviteCodeRequired && state.inviteCodeVerified) {
    trustInviteAccessForDevice();
  }
  updateUsernameDisplay();
  closeUsernameModal();
  await deps.loadPersonalData?.(name, isSwitch); // from personal.js
  deps.renderAllSections?.(); // from render.js
  if (recommendLockSetup) {
    state.lockRecommendationPending = true;
    state.lockRecommendationMessage = lockPromptMessage;
    openSecurityModal();
  }
}

export async function saveUsername(name) {
  // 変更なしはそのまま閉じる
  if (name === state.currentUsername) { closeUsernameModal(); return; }

  // 重複チェック
  const submitBtn = document.getElementById('username-submit');
  const spinner = document.getElementById('username-submit-spinner');
  const submitText = document.getElementById('username-submit-text');
  submitBtn.disabled = true;
  spinner.hidden = false;
  hideUsernameError();

  try {
    let alreadyExists = false;
    if (isSupabaseSharedCoreEnabled()) {
      alreadyExists = await checkUserExistsInSupabase(name);
    } else {
      const snap = await getDoc(doc(db, 'users_list', name));
      alreadyExists = snap.exists();
    }
    if (alreadyExists) {
      showUsernameError('このユーザーネームはすでに使用されています。');
      // 自分のアカウント再ログイン用ボタンを表示
      document.getElementById('username-reclaim').hidden = false;
      submitBtn.disabled = false;
      spinner.hidden = true;
      return;
    }
  } catch (_) { /* オフライン等は無視 */ }

  // 既存ユーザーの場合はデータを旧名 → 新名へ移行
  if (state.currentUsername) {
    submitText.textContent = '移行中...';
    try {
      await migrateToNewUsername(state.currentUsername, name);
    } catch (e) {
      console.error('ユーザー名移行エラー:', e);
      showUsernameError('データの移行に失敗しました。もう一度お試しください。');
      submitBtn.disabled = false;
      spinner.hidden = true;
      submitText.textContent = '変更する';
      return;
    }
  }

  if (!state.currentUsername) {
    submitText.textContent = 'Saving...';
    await registerUserLogin(name);
  }

  submitBtn.disabled = false;
  spinner.hidden = true;
  await applyUsername(name, {
    recommendLockSetup: !state.currentUsername,
    lockPromptMessage: 'このユーザーネームを他人に使われないよう、最初にPINロックを設定しておくと安心です。'
  });
}

export async function getUserPreloginLockInfo(username) {
  const normalized = `${username || ''}`.trim();
  if (!normalized) return { requiresPin: false, hash: null };
  if (isSupabaseSharedCoreEnabled()) {
    const row = await getUserLockPinFromSupabase(normalized);
    if (!row) return { requiresPin: false, hash: null };
    return { requiresPin: !!row.enabled && !!row.hash, hash: row.hash || null };
  }
  const snap = await getDoc(doc(db, 'users', normalized, 'data', 'lock_pin'));
  if (!snap.exists()) return { requiresPin: false, hash: null };
  const data = snap.data();
  return {
    requiresPin: !!data.enabled && !!data.hash,
    hash: data.hash || null,
  };
}

function hidePreloginError() {
  const errorEl = document.getElementById('auth-prelogin-error');
  if (!errorEl) return;
  errorEl.hidden = true;
  errorEl.textContent = '';
}

function showPreloginError(message) {
  const errorEl = document.getElementById('auth-prelogin-error');
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function setPreloginBusy(isBusy) {
  const submitBtn = document.getElementById('auth-prelogin-submit');
  const spinner = document.getElementById('auth-prelogin-spinner');
  if (submitBtn) submitBtn.disabled = isBusy;
  if (spinner) spinner.hidden = !isBusy;
}

function openPreloginPinModal(username, fromStored = false) {
  const modal = document.getElementById('auth-prelogin-modal');
  const titleEl = document.getElementById('auth-prelogin-title');
  const descEl = document.getElementById('auth-prelogin-desc');
  const userEl = document.getElementById('auth-prelogin-username');
  const input = document.getElementById('auth-prelogin-input');
  if (!modal || !input) return;

  state.pendingLoginUsername = username;
  state.pendingLoginFromStored = fromStored;
  if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-lock"></i> ログイン前PIN確認';
  if (descEl) {
    descEl.textContent = fromStored
      ? 'この端末に保存されているユーザーはPIN保護されています。4桁のPINを入力してください。'
      : 'このユーザーはPIN保護されています。4桁のPINを入力するとログインできます。';
  }
  if (userEl) userEl.textContent = username;
  input.value = '';
  hidePreloginError();
  setPreloginBusy(false);
  closeUsernameModal();
  modal.classList.add('visible');
  setTimeout(() => input.focus(), 80);
}

export function closePreloginPinModal() {
  document.getElementById('auth-prelogin-modal')?.classList.remove('visible');
}

async function resolvePreloginSuccess() {
  if (!preLoginContext) return false;
  const { username, resolve } = preLoginContext;
  preLoginContext = null;
  state.pendingLoginHash = null;
  state.pendingLoginUsername = '';
  state.pendingLoginFromStored = false;
  closePreloginPinModal();
  await applyUsername(username);
  resolve?.(true);
  return true;
}

function restoreUsernameModalForRetry(username, showMissingMessage = false) {
  showUsernameModal(false);
  const input = document.getElementById('username-input');
  if (input) input.value = username || '';
  if (showMissingMessage) {
    showUsernameError('保存されていたユーザーネームが見つかりません。確認してからログインしてください。');
  } else {
    hideUsernameError();
  }
}

export async function cancelPreloginPin() {
  const context = preLoginContext;
  preLoginContext = null;
  state.pendingLoginHash = null;
  state.pendingLoginUsername = '';
  state.pendingLoginFromStored = false;
  closePreloginPinModal();
  if (context?.fromStored) {
    localStorage.removeItem('portal-username');
  }
  restoreUsernameModalForRetry(context?.username || '');
  context?.resolve?.(false);
}

export async function submitPreloginPin(pin) {
  if (!preLoginContext) return false;
  const normalized = `${pin || ''}`.trim();
  if (!/^\d{4}$/.test(normalized)) {
    showPreloginError('4桁のPINを入力してください。');
    return false;
  }
  setPreloginBusy(true);
  hidePreloginError();
  try {
    const hash = await hashPIN(normalized);
    if (hash !== preLoginContext.hash) {
      showPreloginError('PINが違います。');
      return false;
    }
    return await resolvePreloginSuccess();
  } finally {
    setPreloginBusy(false);
  }
}

export async function loginExistingUsername(name, options = {}) {
  const normalized = `${name || ''}`.trim();
  if (!normalized) return false;
  const requirePreloginPin = options.requirePreloginPin ?? (
    !!state.currentUsername &&
    state.currentUsername !== normalized &&
    !options.fromStored
  );
  if (isSupabaseSharedCoreEnabled()) {
    try {
      let userExists = await checkUserExistsInSupabase(normalized);
      if (!userExists && options.fromStored) {
        try {
          await registerUserLoginInSupabase(normalized);
          userExists = true;
        } catch (_) {}
      }
      if (!userExists) {
        if (options.fromStored) {
          restoreUsernameModalForRetry(normalized, false);
          showUsernameError('保存されているユーザーの復元に失敗しました。時間をおいてもう一度お試しください。');
          return false;
        }
        showUsernameError('このユーザーネームは見つかりません。');
        return false;
      }
      const lockInfo = await getUserLockPinFromSupabase(normalized);
      if (requirePreloginPin && lockInfo?.enabled && lockInfo?.hash) {
        state.pendingLoginHash = lockInfo.hash;
        preLoginContext = {
          username: normalized,
          hash: lockInfo.hash,
          fromStored: !!options.fromStored,
          resolve: options.resolve || null,
        };
        openPreloginPinModal(normalized, !!options.fromStored);
        return new Promise(resolve => {
          if (preLoginContext) preLoginContext.resolve = resolve;
        });
      }
      await applyUsername(normalized);
      return true;
    } catch (err) {
      console.error('Existing username login failed:', err);
      if (options.fromStored) {
        restoreUsernameModalForRetry(normalized, false);
      } else {
        showUsernameError('ログイン確認に失敗しました。時間をおいてもう一度お試しください。');
      }
      return false;
    }
  }
  try {
    let userExists = false;
    if (isSupabaseSharedCoreEnabled()) {
      userExists = await checkUserExistsInSupabase(normalized);
    } else {
      const userSnap = await getDoc(doc(db, 'users_list', normalized));
      userExists = userSnap.exists();
    }
    if (!userExists) {
      if (options.fromStored) {
        if (isSupabaseSharedCoreEnabled()) {
          // 初回登録の非同期完了前に再読込しても復元できるようにする。
          try {
            await registerUserLoginInSupabase(normalized);
            userExists = true;
          } catch (_) {}
        }
        if (!userExists) {
          restoreUsernameModalForRetry(normalized, false);
          showUsernameError('保存済みログインの復元に失敗しました。時間をおいてもう一度お試しください。');
          return false;
        }
      } else {
        showUsernameError('このユーザーネームは見つかりません。');
        return false;
      }
    }

    const lockInfo = await getUserPreloginLockInfo(normalized);
    if (requirePreloginPin && lockInfo.requiresPin && lockInfo.hash) {
      state.pendingLoginHash = lockInfo.hash;
      preLoginContext = {
        username: normalized,
        hash: lockInfo.hash,
        fromStored: !!options.fromStored,
        resolve: options.resolve || null,
      };
      openPreloginPinModal(normalized, !!options.fromStored);
      return new Promise(resolve => {
        if (preLoginContext) preLoginContext.resolve = resolve;
      });
    }

    await applyUsername(normalized);
    return true;
  } catch (err) {
    console.error('既存ユーザーログインに失敗しました:', err);
    if (options.fromStored) {
      restoreUsernameModalForRetry(normalized, false);
    } else {
      showUsernameError('ログイン確認に失敗しました。時間をおいてもう一度お試しください。');
    }
    return false;
  }
}

export async function restoreStoredUsernameSession(username) {
  const normalized = `${username || ''}`.trim();
  if (!normalized) return false;
  return await loginExistingUsername(normalized, {
    fromStored: true,
    requirePreloginPin: !isMobilePreloginExemptDevice(),
  });
}

// ========== PINロック ==========
let lockClockTimer = null;

export async function loadLockSettings(username, lockImmediately = false) {
  if (!username) return;
  // ユーザー切り替え時に前のユーザーの設定をリセット
  state.lockPinHash = null; state.lockPinEnabled = false; state.lockEnabled = false; state.autoLockMinutes = 5;
  if (isSupabaseSharedCoreEnabled()) {
    try {
      const row = await getUserLockPinFromSupabase(username);
      if (row) {
        state.lockPinHash = row.hash || null;
        state.lockPinEnabled = !!state.lockPinHash;
        state.lockEnabled = !!row.enabled;
        state.autoLockMinutes = row.autoLockMinutes ?? 5;
      }
    } catch (err) {
      console.error('Supabase lock settings load error:', err);
      showToast('ロック設定の読み込みに失敗しました。', 'error');
    }
    document.getElementById('btn-lock-header').hidden = !(state.lockEnabled && state.lockPinEnabled && state.currentUsername);
    if (state.lockEnabled && state.lockPinEnabled) {
      startActivityTracking();
      const shouldLock = lockImmediately || (sessionStorage.getItem('portal-locked') === username);
      if (shouldLock) lockPortal();
    } else {
      sessionStorage.removeItem('portal-locked');
    }
    return;
  }
  try {
    if (isSupabaseSharedCoreEnabled()) {
      try {
        const row = await getUserLockPinFromSupabase(username);
        if (row) {
          state.lockPinHash     = row.hash || null;
          state.lockPinEnabled  = !!state.lockPinHash;
          state.lockEnabled     = !!row.enabled;
          state.autoLockMinutes = row.autoLockMinutes ?? 5;
        }
      } catch (err) {
        console.warn('Supabase lock_pin 読込失敗:', err);
      }
    } else {
      const snap = await getDoc(doc(db, 'users', username, 'data', 'lock_pin'));
      if (snap.exists()) {
        const data = snap.data();
        state.lockPinHash      = data.hash || null;
        state.lockPinEnabled   = !!state.lockPinHash;
        state.lockEnabled      = data.enabled ?? false;
        state.autoLockMinutes  = data.autoLockMinutes ?? 5;
      }
    }
  } catch (_) {}
  document.getElementById('btn-lock-header').hidden = !(state.lockEnabled && state.lockPinEnabled && state.currentUsername);
  if (state.lockEnabled && state.lockPinEnabled) {
    startActivityTracking();
    // リロード後または切り替え時: セッションストレージにロックフラグがあれば再ロック
    const shouldLock = lockImmediately || (sessionStorage.getItem('portal-locked') === username);
    if (shouldLock) lockPortal();
  } else {
    // PIN無効ならロックフラグも消す
    sessionStorage.removeItem('portal-locked');
  }
}

export async function saveLockSettings() {
  if (!state.currentUsername) return;
  try {
    if (isSupabaseSharedCoreEnabled()) {
      await saveLockPinToSupabase(state.currentUsername, {
        enabled: state.lockEnabled,
        hash: state.lockPinHash,
        autoLockMinutes: state.autoLockMinutes,
      });
    } else {
      await setDoc(doc(db, 'users', state.currentUsername, 'data', 'lock_pin'), {
        enabled: state.lockEnabled,
        autoLockMinutes: state.autoLockMinutes
      }, { merge: true });
    }
  } catch (err) {
    console.error('設定保存エラー:', err);
    showToast('ロック設定の保存に失敗しました。', 'error');
  }
}

export function startActivityTracking() {
  ['mousemove', 'click', 'keydown', 'touchstart', 'scroll'].forEach(ev => {
    document.addEventListener(ev, resetActivityTimer, { passive: true });
  });
  if (state._autoLockInterval) clearInterval(state._autoLockInterval);
  state._autoLockInterval = setInterval(checkAutoLock, 30_000);
}

export function stopActivityTracking() {
  if (state._autoLockInterval) { clearInterval(state._autoLockInterval); state._autoLockInterval = null; }
}

export function resetActivityTimer() { state.lastActivityAt = Date.now(); }

export function checkAutoLock() {
  if (!state.lockEnabled || !state.lockPinEnabled || !state.currentUsername) return;
  if (!document.getElementById('lock-screen').hidden) return;
  if (Date.now() - state.lastActivityAt >= state.autoLockMinutes * 60_000) lockPortal();
}

export async function setLockPin(newPin) {
  const hash = await hashPIN(newPin);
  try {
    if (isSupabaseSharedCoreEnabled()) {
      await saveLockPinToSupabase(state.currentUsername, {
        hash,
        enabled: state.lockEnabled,
        autoLockMinutes: state.autoLockMinutes,
      });
    } else {
      await setDoc(doc(db, 'users', state.currentUsername, 'data', 'lock_pin'), { hash }, { merge: true });
    }
    state.lockPinHash    = hash;
    state.lockPinEnabled = true;
    state.lockRecommendationPending = false;
    state.lockRecommendationMessage = '';
    document.getElementById('btn-lock-header').hidden = !(state.lockEnabled && state.currentUsername);
    if (state.lockEnabled) startActivityTracking();
  } catch (err) { console.error('PIN設定エラー:', err); throw err; }
}

export async function removeLockPin() {
  try {
    if (isSupabaseSharedCoreEnabled()) {
      await saveLockPinToSupabase(state.currentUsername, {
        hash: null,
        enabled: false,
        autoLockMinutes: state.autoLockMinutes,
      });
    } else {
      await setDoc(doc(db, 'users', state.currentUsername, 'data', 'lock_pin'), { hash: null }, { merge: true });
    }
    state.lockPinHash    = null;
    state.lockPinEnabled = false;
    document.getElementById('btn-lock-header').hidden = true;
    stopActivityTracking();
  } catch (err) { console.error('PIN解除エラー:', err); throw err; }
}

export function lockPortal() {
  if (!state.lockEnabled || !state.lockPinEnabled || !state.currentUsername) return;
  state.lockCurrentInput = '';
  updateLockDots();
  // ロック画面の情報を更新
  document.getElementById('lock-username').textContent = state.currentUsername;
  const avatarEl = document.getElementById('lock-avatar');
  avatarEl.textContent = state.currentUsername.charAt(0).toUpperCase();
  avatarEl.style.background = getUserAvatarColor(state.currentUsername);
  document.getElementById('lock-pin-error').hidden = true;
  document.getElementById('lock-screen').hidden = false;
  document.body.style.overflow = 'hidden';
  // リロード後も再ロックされるようにセッションストレージに記録
  sessionStorage.setItem('portal-locked', state.currentUsername);
  // 通知インジケーター更新
  updateLockNotifications();
  // 時計更新
  updateLockClock();
  lockClockTimer = setInterval(updateLockClock, 1000);
}

export function updateLockNotifications() {
  const el = document.getElementById('lock-notifications');
  if (!el) return;

  const items = [];

  // チャット未読
  const chatUnread = [...state.dmRooms, ...state.groupRooms].reduce((sum, r) => sum + (deps.getRoomUnread?.(r) || 0), 0); // from chat.js
  if (chatUnread > 0) items.push({ icon: 'fa-comments',       count: chatUnread, color: '#60a5fa', label: 'チャット' });

  // お知らせ未読
  const noticeUnread = state.allNotices.filter(n => !state.readNoticeIds.has(n.id)).length;
  if (noticeUnread > 0) items.push({ icon: 'fa-bell',          count: noticeUnread, color: '#a78bfa', label: 'お知らせ' });

  // タスク（承諾待ち + 完了報告）
  const taskCount = state.receivedTasks.filter(t => t.status === 'pending').length
                  + state.sentTasks.filter(t => t.status === 'done' && !t.notifiedDone).length;
  if (taskCount > 0) items.push({ icon: 'fa-list-check',      count: taskCount, color: '#fbbf24', label: 'タスク' });

  // ファイル転送受信待ち（P2P + Drive）
  const ftCount = state._ftIncoming.filter(s => s.status === 'pending').length
                + state._driveIncoming.filter(s => s.status === 'pending').length;
  if (ftCount > 0) items.push({ icon: 'fa-file-arrow-up',     count: ftCount, color: '#34d399', label: 'ファイル' });

  if (!items.length) { el.innerHTML = ''; return; }

  el.innerHTML = items.map(item => `
    <div class="lock-notif-item">
      <div class="lock-notif-icon" style="border-color:${item.color}60; color:${item.color}">
        <i class="fa-solid ${item.icon}"></i>
        <span class="lock-notif-badge">${item.count > 99 ? '99+' : item.count}</span>
      </div>
      <div class="lock-notif-label">${item.label}</div>
    </div>`).join('');
}

export function lockSwitchUser() {
  // ロックフラグをクリアしてロック画面を閉じ、ユーザーネームモーダルを開く
  sessionStorage.removeItem('portal-locked');
  document.getElementById('lock-screen').hidden = true;
  document.body.style.overflow = '';
  clearInterval(lockClockTimer);
  state.lockCurrentInput = '';
  updateLockDots();
  // ユーザーネーム設定モーダルを開く（新規入力扱い）
  showUsernameModal(false);
}

export function updateLockClock() {
  const now = new Date();
  const h = now.getHours().toString().padStart(2, '0');
  const m = now.getMinutes().toString().padStart(2, '0');
  document.getElementById('lock-clock').textContent = `${h}:${m}`;
}

export async function handleLockKeyPress(digit) {
  if (state.lockCurrentInput.length >= 4) return;
  state.lockCurrentInput += digit;
  updateLockDots();
  if (state.lockCurrentInput.length === 4) {
    await verifyLockPin(state.lockCurrentInput);
  }
}

export function handleLockDelete() {
  if (state.lockCurrentInput.length > 0) {
    state.lockCurrentInput = state.lockCurrentInput.slice(0, -1);
    updateLockDots();
  }
}

export function updateLockDots() {
  const dots = document.querySelectorAll('#lock-pin-dots span');
  dots.forEach((dot, i) => {
    dot.classList.toggle('filled', i < state.lockCurrentInput.length);
  });
}

export async function verifyLockPin(pin) {
  const hash = await hashPIN(pin);
  if (hash === state.lockPinHash) {
    // 解錠
    sessionStorage.removeItem('portal-locked'); // ロックフラグをクリア
    document.getElementById('lock-screen').hidden = true;
    document.body.style.overflow = '';
    clearInterval(lockClockTimer);
    state.lockCurrentInput = '';
    updateLockDots();
  } else {
    // 失敗
    state.lockCurrentInput = '';
    updateLockDots();
    const errEl = document.getElementById('lock-pin-error');
    errEl.hidden = false;
    document.getElementById('lock-pin-dots').classList.add('shake');
    setTimeout(() => {
      document.getElementById('lock-pin-dots').classList.remove('shake');
      errEl.hidden = true;
    }, 800);
  }
}

// セキュリティ設定モーダル
export function openSecurityModal() {
  const recommendBox = document.getElementById('security-recommend-box');
  const recommendText = document.getElementById('security-recommend-text');
  if (recommendBox) {
    recommendBox.hidden = !state.lockRecommendationPending;
  }
  if (recommendText) {
    recommendText.textContent = state.lockRecommendationMessage || 'なりすまし防止のため、PINロック設定をおすすめします。';
  }

  // トグル状態を反映
  document.getElementById('lock-enabled-toggle').checked = state.lockEnabled;

  // 自動ロックセクション表示切り替え
  document.getElementById('security-autolock-section').hidden = !state.lockEnabled;

  // 選択中の自動ロック時間をハイライト
  document.querySelectorAll('.autolock-time-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.minutes) === state.autoLockMinutes);
  });

  // PIN設定エリアのリセット
  const setupArea  = document.getElementById('security-setup-area');
  const manageArea = document.getElementById('security-manage-area');
  document.getElementById('new-pin-input').value      = '';
  document.getElementById('confirm-pin-input').value  = '';
  document.getElementById('security-pin-error').hidden = true;
  const curInput = document.getElementById('current-pin-input');
  if (curInput) curInput.value = '';
  const curErr = document.getElementById('security-current-error');
  if (curErr) curErr.hidden = true;

  if (state.lockPinEnabled) {
    setupArea.hidden  = true;
    manageArea.hidden = false;
  } else {
    setupArea.hidden  = false;
    manageArea.hidden = true;
  }

  document.getElementById('security-modal').classList.add('visible');
}

export async function openAdminModal() {
  document.getElementById('admin-auth-area').hidden  = false;
  document.getElementById('admin-panel-area').hidden = true;
  document.getElementById('admin-setup-area').hidden = true;
  document.getElementById('admin-pin-input').value   = '';
  document.getElementById('admin-auth-error').hidden = true;
  document.getElementById('admin-modal').classList.add('visible');

  // PIN未設定なら設定モードで開く
  const configured = await isPINConfigured();
  if (!configured) {
    document.getElementById('admin-auth-area').hidden  = true;
    document.getElementById('admin-setup-area').hidden = false;
    document.getElementById('admin-new-pin').value         = '';
    document.getElementById('admin-new-pin-confirm').value = '';
    document.getElementById('admin-setup-error').hidden    = true;
    setTimeout(() => document.getElementById('admin-new-pin').focus(), 100);
  } else {
    setTimeout(() => document.getElementById('admin-pin-input').focus(), 100);
  }
}

export function closeAdminModal() {
  document.getElementById('admin-modal').classList.remove('visible');
}

export async function deleteUserData(username) {
  if (isSupabaseSharedCoreEnabled()) {
    await deleteUserFromSupabase(username);
    return;
  }
  // 1. users_list エントリ + data サブドキュメントを一括削除
  const batch1 = writeBatch(db);
  batch1.delete(doc(db, 'users_list', username));
  for (const docId of ['preferences', 'section_order', 'lock_pin', 'chat_reads']) {
    batch1.delete(doc(db, 'users', username, 'data', docId));
  }
  await batch1.commit();

  // 2. private_sections
  if (isSupabaseSharedCoreEnabled()) {
    try {
      const sections = await fetchPrivateSectionsFromSupabase(username);
      await Promise.all(sections.map(s => deletePrivateSectionInSupabase(s.id)));
    } catch (_) {}
  } else {
    try {
      const psSnap = await getDocs(collection(db, 'users', username, 'private_sections'));
      if (!psSnap.empty) {
        const b = writeBatch(db);
        psSnap.forEach(d => b.delete(d.ref));
        await b.commit();
      }
    } catch (_) {}
  }

  // 3. private_cards
  if (isSupabaseSharedCoreEnabled()) {
    try {
      const cards = await fetchPrivateCardsFromSupabase(username);
      await Promise.all(cards.map(c => deletePrivateCardInSupabase(c.id)));
    } catch (_) {}
  } else {
    try {
      const pcSnap = await getDocs(collection(db, 'users', username, 'private_cards'));
      if (!pcSnap.empty) {
        const b = writeBatch(db);
        pcSnap.forEach(d => b.delete(d.ref));
        await b.commit();
      }
    } catch (_) {}
  }

  // 4. email_profiles
  try {
    const epSnap = await getDocs(collection(db, 'users', username, 'email_profiles'));
    if (!epSnap.empty) {
      const b = writeBatch(db);
      epSnap.forEach(d => b.delete(d.ref));
      await b.commit();
    }
  } catch (_) {}
}

export async function loadUsersForAdmin() {
  const listEl = document.getElementById('admin-user-list');
  listEl.innerHTML = '<div class="admin-loading">読み込み中...</div>';
  try {
    let users = [];
    if (isSupabaseSharedCoreEnabled()) {
      users = (await fetchAllUserAccountsFromSupabase()).map(r => r.username);
    } else {
      const snap = await getDocs(collection(db, 'users_list'));
      users = snap.docs.map(d => d.id);
    }
    if (!users.length) { listEl.innerHTML = '<div class="admin-loading">ユーザーなし</div>'; return; }
    listEl.innerHTML = '';
    for (const name of users) {
      const item = document.createElement('div');
      item.className = 'admin-user-item';
      item.innerHTML = `
        <div class="admin-user-info">
          <span class="admin-user-avatar">${name.charAt(0).toUpperCase()}</span>
          <span class="admin-user-name">${deps.esc?.(name) ?? name}</span>
        </div>
        <div class="admin-user-actions">
          <button class="btn-admin-reset-pin" data-username="${deps.esc?.(name) ?? name}">PINリセット</button>
          <button class="btn-admin-delete-user" data-username="${deps.esc?.(name) ?? name}"><i class="fa-solid fa-trash-can"></i> 削除</button>
        </div>
      `;

      // PINリセット
      item.querySelector('.btn-admin-reset-pin').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if (!await showConfirm(`${name} さんのPINをリセットしますか？`, { danger: true })) return;
        btn.disabled = true;
        btn.textContent = '処理中...';
        try {
          if (isSupabaseSharedCoreEnabled()) {
            await saveLockPinToSupabase(name, { hash: null, enabled: false, autoLockMinutes: 5 });
          } else {
            await setDoc(doc(db, 'users', name, 'data', 'lock_pin'), { hash: null, enabled: false }, { merge: true });
          }
          btn.textContent = 'リセット済み ✓';
          if (name === state.currentUsername) {
            state.lockPinHash = null; state.lockPinEnabled = false; state.lockEnabled = false;
            document.getElementById('btn-lock-header').hidden = true;
            stopActivityTracking();
          }
        } catch (_) { btn.disabled = false; btn.textContent = 'エラー'; }
      });

      // ユーザー削除
      item.querySelector('.btn-admin-delete-user').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if (!await showConfirm(`「${name}」のアカウントとすべての個人データを削除しますか？\nこの操作は取り消せません。`, { danger: true })) return;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 削除中...';
        try {
          await deleteUserData(name);
          item.remove();
          // 自分自身を削除した場合はログアウト
          if (name === state.currentUsername) {
            state.currentUsername = null;
            localStorage.removeItem('portal-username');
            location.reload();
          }
          // リストが空になったか確認
          if (!listEl.querySelector('.admin-user-item')) {
            listEl.innerHTML = '<div class="admin-loading">ユーザーなし</div>';
          }
        } catch (err) {
          console.error('ユーザー削除エラー:', err);
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-trash-can"></i> 削除';
          showToast('削除に失敗しました。', 'error');
        }
      });

      listEl.appendChild(item);
    }
  } catch (_) {
    listEl.innerHTML = '<div class="admin-loading">読み込みエラー</div>';
  }
}

export function closeSecurityModal() {
  state.lockRecommendationPending = false;
  state.lockRecommendationMessage = '';
  document.getElementById('security-modal').classList.remove('visible');
}

// ユーザー名の頭文字から一貫したアバターカラーを生成
export function getUserAvatarColor(name) {
  const colors = [
    'linear-gradient(135deg,#6366f1,#8b5cf6)',
    'linear-gradient(135deg,#0ea5e9,#06b6d4)',
    'linear-gradient(135deg,#10b981,#059669)',
    'linear-gradient(135deg,#f59e0b,#d97706)',
    'linear-gradient(135deg,#ef4444,#dc2626)',
    'linear-gradient(135deg,#ec4899,#db2777)',
    'linear-gradient(135deg,#14b8a6,#0d9488)',
    'linear-gradient(135deg,#f97316,#ea580c)',
  ];
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return colors[hash % colors.length];
}

export function updateUsernameDisplay() {
  const nameEl    = document.getElementById('username-display');
  const greetEl   = document.getElementById('user-greeting');
  const avatarEl  = document.getElementById('user-avatar');
  const btnEl     = document.getElementById('btn-user');

  if (state.currentUsername) {
    const initial = state.currentUsername.charAt(0).toUpperCase();
    if (avatarEl) {
      avatarEl.textContent = initial;
      avatarEl.style.background = getUserAvatarColor(state.currentUsername);
    }
    if (nameEl)  nameEl.textContent  = state.currentUsername;
    if (greetEl) greetEl.textContent = 'こんにちは';
    if (btnEl)   btnEl.classList.add('btn-user--active');
  } else {
    if (avatarEl) {
      avatarEl.innerHTML = '<i class="fa-solid fa-user"></i>';
      avatarEl.style.background = '';
    }
    if (nameEl)  nameEl.textContent  = '';
    if (greetEl) greetEl.textContent = '名前を設定してください';
    if (btnEl)   btnEl.classList.remove('btn-user--active');
  }
}

// Supabase の users_list にログイン記録（管理者が全員を把握できる）
export async function registerUserLogin(username) {
  if (!username) return false;
  try {
    if (isSupabaseSharedCoreEnabled()) {
      await registerUserLoginInSupabase(username);
    } else {
      const ref  = doc(db, 'users_list', username);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, { displayName: username, createdAt: serverTimestamp(), lastLogin: serverTimestamp() });
      } else {
        await updateDoc(ref, { lastLogin: serverTimestamp() });
      }
    }
  } catch (err) {
    console.error('ユーザー登録エラー:', err);
  }
}

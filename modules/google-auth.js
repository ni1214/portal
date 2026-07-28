import { state } from './state.js';
import {
  claimPortalAccountInSupabase,
} from './supabase.js';
import { showToast } from './notify.js';
import { createClient } from '../vendor/supabase.js';

let deps = {};
let supabaseAuthClient = null;
let authSubscription = null;
const signedInUserTasks = new Map();

function getRedirectTo() {
  return new URL('/', window.location.origin).toString();
}

function normalizeEmail(email) {
  return `${email || ''}`.trim().toLowerCase();
}

function deriveGoogleProfile(user = {}) {
  const meta = user.user_metadata || {};
  return {
    authId: user.id || '',
    email: normalizeEmail(user.email || meta.email || ''),
    name: meta.full_name || meta.name || user.email || '',
    avatarUrl: meta.avatar_url || meta.picture || '',
  };
}

async function getSupabaseAuthClient() {
  if (supabaseAuthClient) return supabaseAuthClient;
  if (!state.supabaseUrl || !state.supabaseApiKey) {
    throw new Error('Supabase 設定がありません。');
  }
  supabaseAuthClient = createClient(state.supabaseUrl, state.supabaseApiKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  });
  return supabaseAuthClient;
}

function resetIdentityState() {
  state.googleAuthSession = null;
  state.googleAuthUser = null;
  state.googleAuthProfile = null;
  state.googleAuthLinkedUsername = '';
  state.googleAuthLinkRequired = false;
  state.isAccountActive = false;
  state.isAdmin = false;
  state.currentUsername = null;
  localStorage.removeItem('portal-username');
}

function showUnlinkedAccountMessage(profile) {
  deps.showUsernameModal?.(false);
  const input = document.getElementById('username-input');
  const submit = document.getElementById('username-submit');
  const reclaim = document.getElementById('username-reclaim');
  const desc = document.getElementById('username-modal-desc');
  const errorBox = document.getElementById('username-error-box');
  const errorText = document.getElementById('username-error-msg');
  const skip = document.getElementById('username-skip');
  if (input) {
    input.value = '';
    input.disabled = true;
  }
  if (submit) submit.hidden = true;
  if (reclaim) reclaim.hidden = true;
  if (desc) desc.textContent = 'このGoogleアカウントはポータル利用者に登録されていません。管理者へ登録を依頼してください。';
  if (errorText) errorText.textContent = `${profile?.email || 'このアカウント'} は未登録です。`;
  if (errorBox) errorBox.hidden = false;
  if (skip) skip.textContent = 'ログアウト';
}

function restoreLinkedAccountUi() {
  const input = document.getElementById('username-input');
  const submit = document.getElementById('username-submit');
  if (input) input.disabled = false;
  if (submit) submit.hidden = false;
}

function setGoogleState(session = null) {
  const user = session?.user || null;
  state.googleAuthSession = session || null;
  state.googleAuthUser = user;
  state.googleAuthProfile = user ? deriveGoogleProfile(user) : null;
}

async function resolveLinkedAccount(profile) {
  if (!profile?.authId || !profile?.email) {
    throw new Error('Googleアカウントの識別情報を確認できません。');
  }
  return await claimPortalAccountInSupabase(profile);
}

async function handleSignedInUser(user) {
  const profile = deriveGoogleProfile(user);
  state.googleAuthProfile = profile;
  const linked = await resolveLinkedAccount(profile);
  if (linked?.username) {
    if (!linked.isActive) {
      state.isAdmin = false;
      state.isAccountActive = false;
      showToast('このアカウントは無効です。管理者へお問い合わせください。', 'error');
      await signOutGoogle({ reload: false });
      deps.showUsernameModal?.(false);
      return false;
    }
    restoreLinkedAccountUi();
    state.googleAuthLinkedUsername = linked.username;
    state.googleAuthLinkRequired = false;
    state.isAccountActive = true;
    state.isAdmin = linked.isAdmin === true;
    await deps.applyUsername?.(linked.username, { skipGoogleLink: true });
    deps.updateUsernameDisplay?.();
    return true;
  }

  state.googleAuthLinkedUsername = '';
  state.googleAuthLinkRequired = true;
  state.isAccountActive = false;
  state.isAdmin = false;
  showUnlinkedAccountMessage(profile);
  return false;
}

function processSignedInUser(user) {
  const userId = `${user?.id || ''}`.trim();
  if (!userId) return Promise.resolve(false);
  const currentTask = signedInUserTasks.get(userId);
  if (currentTask) return currentTask;

  let task;
  task = Promise.resolve()
    .then(() => handleSignedInUser(user))
    .catch(err => {
      console.error('Google account claim failed:', err);
      showToast('Googleアカウント情報の確認に失敗しました。時間をおいて再度お試しください。', 'error');
      return false;
    })
    .finally(() => {
      if (signedInUserTasks.get(userId) === task) signedInUserTasks.delete(userId);
    });
  signedInUserTasks.set(userId, task);
  return task;
}

export async function initGoogleAuth(d = {}) {
  deps = { ...deps, ...d };
  const client = await getSupabaseAuthClient();
  authSubscription?.unsubscribe?.();
  const { data } = client.auth.onAuthStateChange((event, session) => {
    setGoogleState(session);
    if (event === 'SIGNED_OUT') {
      resetIdentityState();
      deps.updateUsernameDisplay?.();
      return;
    }
    if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return;
    if (!session?.user?.id) return;
    setTimeout(() => {
      void processSignedInUser(session.user);
    }, 0);
  });
  authSubscription = data?.subscription || null;
  return client;
}

export async function restoreGoogleAuthSession() {
  state.googleAuthLoading = true;
  try {
    const client = await getSupabaseAuthClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    setGoogleState(data?.session || null);
    if (!data?.session?.user) return false;
    return await processSignedInUser(data.session.user);
  } catch (err) {
    console.error('Google login restore failed:', err);
    showToast('Googleログインの確認に失敗しました。', 'error');
    return false;
  } finally {
    state.googleAuthLoading = false;
  }
}

export async function signInWithGoogle() {
  const client = await getSupabaseAuthClient();
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: getRedirectTo(),
      queryParams: {
        access_type: 'offline',
        prompt: 'select_account',
      },
    },
  });
  if (error) {
    console.error('Google sign-in failed:', error);
    showToast('Googleログインを開始できませんでした。', 'error');
  }
}

export async function signOutGoogle({ reload = true } = {}) {
  try {
    const client = await getSupabaseAuthClient();
    await client.auth.signOut();
  } catch (err) {
    console.error('Google sign-out failed:', err);
  }
  resetIdentityState();
  deps.updateUsernameDisplay?.();
  if (reload) window.location.reload();
}

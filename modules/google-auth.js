import { state } from './state.js';
import {
  fetchUserAccountByGoogleAuthId,
  fetchUserAccountByGoogleEmail,
  linkGoogleAccountToUsername,
} from './supabase.js';
import { showToast } from './notify.js';

const SUPABASE_JS_URLS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm',
  'https://esm.sh/@supabase/supabase-js@2',
];

let deps = {};
let supabaseAuthClient = null;
let authSubscription = null;
let handlingUserId = '';

function getRedirectTo() {
  return window.location.origin + window.location.pathname;
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

function buildUsernameSuggestion(profile = {}) {
  const base = profile.name || profile.email?.split('@')[0] || '';
  return `${base}`.trim().slice(0, 20);
}

async function getSupabaseAuthClient() {
  if (supabaseAuthClient) return supabaseAuthClient;
  if (!state.supabaseUrl || !state.supabaseApiKey) {
    throw new Error('Supabase 設定がありません。');
  }
  let createClient = null;
  let lastError = null;
  for (const url of SUPABASE_JS_URLS) {
    try {
      ({ createClient } = await import(url));
      break;
    } catch (err) {
      lastError = err;
      console.warn('Supabase Auth client load failed:', url, err);
    }
  }
  if (!createClient) throw lastError || new Error('Supabase Auth client を読み込めませんでした。');
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

function setGoogleState(session = null) {
  const user = session?.user || null;
  state.googleAuthSession = session || null;
  state.googleAuthUser = user;
  state.googleAuthProfile = user ? deriveGoogleProfile(user) : null;
}

async function resolveLinkedAccount(profile) {
  if (!profile?.authId && !profile?.email) return null;
  const byAuthId = profile.authId
    ? await fetchUserAccountByGoogleAuthId(profile.authId).catch(() => null)
    : null;
  if (byAuthId) return byAuthId;
  const byEmail = profile.email
    ? await fetchUserAccountByGoogleEmail(profile.email).catch(() => null)
    : null;
  if (byEmail?.username) {
    await linkGoogleAccountToUsername(byEmail.username, profile);
    return { ...byEmail, googleAuthId: profile.authId };
  }
  return null;
}

async function handleSignedInUser(user) {
  const profile = deriveGoogleProfile(user);
  state.googleAuthProfile = profile;
  const linked = await resolveLinkedAccount(profile);
  if (linked?.username) {
    state.googleAuthLinkedUsername = linked.username;
    state.googleAuthLinkRequired = false;
    await deps.applyUsername?.(linked.username, { skipGoogleLink: true });
    deps.updateUsernameDisplay?.();
    return true;
  }

  state.googleAuthLinkedUsername = '';
  state.googleAuthLinkRequired = true;
  deps.showUsernameModal?.(false);
  const input = document.getElementById('username-input');
  if (input && !input.value) input.value = buildUsernameSuggestion(profile);
  return false;
}

export async function initGoogleAuth(d = {}) {
  deps = { ...deps, ...d };
  const client = await getSupabaseAuthClient();
  authSubscription?.unsubscribe?.();
  const { data } = client.auth.onAuthStateChange((event, session) => {
    setGoogleState(session);
    if (event === 'INITIAL_SESSION') return;
    const userId = session?.user?.id || '';
    if (!userId || userId === handlingUserId) return;
    handlingUserId = userId;
    setTimeout(() => {
      void handleSignedInUser(session.user).finally(() => {
        handlingUserId = '';
      });
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
    await handleSignedInUser(data.session.user);
    return true;
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
  state.googleAuthSession = null;
  state.googleAuthUser = null;
  state.googleAuthProfile = null;
  state.googleAuthLinkedUsername = '';
  state.googleAuthLinkRequired = false;
  state.currentUsername = null;
  localStorage.removeItem('portal-username');
  deps.updateUsernameDisplay?.();
  if (reload) window.location.reload();
}

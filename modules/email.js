// ========== メールアシスタント ==========
import {
  db, doc, getDoc, getDocs, setDoc, deleteDoc,
  collection, query, orderBy, serverTimestamp
} from './config.js';
import { state, USER_ROLE_OPTIONS, USER_ROLE_LABELS } from './state.js';
import { esc } from './utils.js';
import {
  isSupabaseSharedCoreEnabled,
  fetchUserProfileFromSupabase,
  saveUserProfileToSupabase,
} from './supabase.js';

let deps = {};
export function initEmail(d) { deps = d; }

// ===== 文体定義 =====
const TONE_PROMPTS = {
  business: '標準的なビジネスメールの文体で作成してください。適度な敬語を使い、要件を明確に伝えてください。',
  polite:   '最上級の敬語を使い、非常に丁寧な文体で作成してください。お客様や目上の方への文体です。',
  internal: '社内向けの文体で作成してください。敬語は使いますが簡潔に、要点は箇条書きにしても構いません。',
  strict:   '事実を簡潔かつ明確に伝える文体で作成してください。感情を排除し、業務的な内容を端的にまとめてください。',
};

const DEFAULT_SIGNATURE_TEMPLATE =
`━━━━━━━━━━━━━━━━━━━━━━
{realName}　{department}
日建フレメックス株式会社
TEL：{phone}
E-mail：{email}
━━━━━━━━━━━━━━━━━━━━━━`;


// ===== モジュール内状態 =====
let geminiApiKey    = null;
let emailModalLoaded = false;
let userEmailProfile = buildNormalizedProfile();
let emailContacts   = [];       // [{ id, companyName, personName }]
let emailMode       = null;     // 'new' | 'reply'
let selectedTone    = 'business';
let selectedContactId = null;
let emailModalContext = 'assistant';

function buildNormalizedProfile(raw = {}) {
  const realName = typeof raw.realName === 'string'
    ? raw.realName.trim()
    : (typeof raw.name === 'string' ? raw.name.trim() : '');
  const department = typeof raw.department === 'string' ? raw.department.trim() : '';
  const roleType = USER_ROLE_LABELS[raw.roleType] ? raw.roleType : 'member';
  const email = typeof raw.email === 'string' ? raw.email.trim() : '';
  const phone = typeof raw.phone === 'string' ? raw.phone.trim() : '';
  const signatureTemplate = typeof raw.signatureTemplate === 'string' ? raw.signatureTemplate : '';

  return {
    name: realName,
    realName,
    department,
    roleType,
    email,
    phone,
    signatureTemplate,
  };
}

function syncUserEmailProfile(raw = {}) {
  userEmailProfile = buildNormalizedProfile(raw);
  state.userEmailProfile = { ...userEmailProfile };
  return userEmailProfile;
}

export async function loadUserEmailProfile(username = state.currentUsername) {
  syncUserEmailProfile();
  if (!username) return state.userEmailProfile;

  try {
    if (isSupabaseSharedCoreEnabled()) {
      const row = await fetchUserProfileFromSupabase(username).catch(err => {
        console.warn('Supabase profile 読込失敗、Firestore fallback:', err);
        return null;
      });
      if (row) {
        syncUserEmailProfile(row);
      } else {
        // Supabase に無ければ Firestore から fallback
        const profSnap = await getDoc(doc(db, 'users', username, 'data', 'email_profile'));
        if (profSnap.exists()) syncUserEmailProfile(profSnap.data());
      }
    } else {
      const profSnap = await getDoc(doc(db, 'users', username, 'data', 'email_profile'));
      if (profSnap.exists()) syncUserEmailProfile(profSnap.data());
    }
  } catch (_) {}

  if (emailModalLoaded) renderProfileTab();

  return state.userEmailProfile;
}

// ===== 初期データ読み込み =====
export async function loadEmailData() {
  try {
    const snap = await getDoc(doc(db, 'portal', 'config'));
    geminiApiKey = snap.data()?.geminiApiKey || null;
  } catch (_) {}

  if (state.currentUsername) {
    await loadEmailContacts();
    await loadUserEmailProfile(state.currentUsername);
  }

  updateApiKeyUI();
  renderContactSelect();
  renderProfileTab();
  emailModalLoaded = true;
}

// ===== 連絡先読み込み =====
async function loadEmailContacts() {
  try {
    const snap = await getDocs(
      query(collection(db, 'users', state.currentUsername, 'email_contacts'), orderBy('createdAt', 'asc'))
    );
    emailContacts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (_) {
    emailContacts = [];
  }
}

// ===== 連絡先セレクト描画 =====
function renderContactSelect() {
  const sel = document.getElementById('email-contact-select');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">相手を選択（または新規追加）...</option>';
  emailContacts.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.companyName}　${c.personName}`;
    sel.appendChild(opt);
  });
  if (current && emailContacts.find(c => c.id === current)) sel.value = current;
}

// ===== 連絡先保存 =====
export async function saveNewContact() {
  if (!state.currentUsername) { alert('ユーザーネームを設定してください'); return; }
  const company = document.getElementById('email-contact-company')?.value.trim();
  const person  = document.getElementById('email-contact-person')?.value.trim();
  if (!company && !person) { alert('会社名または担当者名を入力してください'); return; }

  const id = `contact_${Date.now()}`;
  try {
    await setDoc(doc(db, 'users', state.currentUsername, 'email_contacts', id), {
      companyName: company || '',
      personName:  person  || '',
      createdAt:   serverTimestamp(),
    });
    emailContacts.push({ id, companyName: company || '', personName: person || '' });
    renderContactSelect();
    document.getElementById('email-contact-select').value = id;
    selectedContactId = id;

    // フォームを閉じる
    document.getElementById('email-new-contact').hidden = true;
    document.getElementById('email-contact-company').value = '';
    document.getElementById('email-contact-person').value  = '';
  } catch (err) {
    console.error('連絡先保存エラー:', err);
    alert('保存に失敗しました');
  }
}

// ===== APIキーUI更新 =====
function updateApiKeyUI() {
  const area = document.getElementById('email-api-key-area');
  if (!area) return;
  area.hidden = !!geminiApiKey;
}

// ===== モード設定（新規/返信） =====
export function setEmailMode(mode) {
  emailMode = mode;
  const form       = document.getElementById('email-compose-form');
  const typeSelect = document.getElementById('email-type-select');
  const recvSection = document.getElementById('email-section-received');
  const contentLabel = document.getElementById('email-content-label');
  const generateBtn  = document.getElementById('email-generate');

  typeSelect.hidden = true;
  form.hidden = false;

  if (mode === 'reply') {
    recvSection.hidden = false;
    if (contentLabel) contentLabel.innerHTML = '<i class="fa-solid fa-comment-dots"></i> 追加で伝えたいこと（省略可）';
    if (generateBtn) generateBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> 返信メールを生成する';
  } else {
    recvSection.hidden = true;
    if (contentLabel) contentLabel.innerHTML = '<i class="fa-solid fa-comment-dots"></i> 伝えたいこと';
    if (generateBtn) generateBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> メールを生成する';
  }

  // 出力エリアをリセット
  document.getElementById('email-output-area').hidden = true;
  document.getElementById('email-output').textContent = '';
}

// ===== 選択に戻る =====
export function resetEmailMode() {
  emailMode = null;
  document.getElementById('email-compose-form').hidden = true;
  document.getElementById('email-type-select').hidden = false;
  document.getElementById('email-output-area').hidden = true;
  document.getElementById('email-output').textContent = '';
  document.getElementById('email-new-contact').hidden = true;
}

// ===== 文体選択 =====
export function selectTone(tone) {
  selectedTone = tone;
  document.querySelectorAll('.email-tone-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tone === tone);
  });
}

// ===== メール生成 =====
export async function generateEmail() {
  if (!geminiApiKey) {
    document.getElementById('email-api-key-area').hidden = false;
    document.getElementById('email-api-key-input').focus();
    return;
  }

  const content = document.getElementById('email-content')?.value.trim();
  if (!content && emailMode === 'new') {
    document.getElementById('email-content')?.focus();
    return;
  }

  const received = emailMode === 'reply' ? document.getElementById('email-received')?.value.trim() : '';
  if (emailMode === 'reply' && !received) {
    document.getElementById('email-received')?.focus();
    return;
  }

  // 相手情報
  const contactId = document.getElementById('email-contact-select')?.value;
  const contact   = emailContacts.find(c => c.id === contactId);
  const toName    = contact ? `${contact.companyName}　${contact.personName}`.trim() : '（相手未選択）';

  const senderName  = userEmailProfile.realName ? `日建フレメックスの${userEmailProfile.realName}` : '日建フレメックスの担当者';
  const sigTemplate = userEmailProfile.signatureTemplate || DEFAULT_SIGNATURE_TEMPLATE;
  const filledSig   = fillSignature(sigTemplate)
    .replace(/\{roleType\}/g, USER_ROLE_LABELS[userEmailProfile.roleType] || USER_ROLE_LABELS.member);
  const tonePrompt  = TONE_PROMPTS[selectedTone] || TONE_PROMPTS.business;

  let fullPrompt = '';
  if (emailMode === 'new') {
    fullPrompt = `あなたは日本の建設会社「日建フレメックス」の社員（${senderName}）です。
以下の条件でビジネスメールを作成してください。

【宛先】${toName}
【文体指示】${tonePrompt}
【伝えたいこと】
${content}

【必須ルール】
- 件名（Subject:）を1行目に書いてください
- 宛名（例：〇〇株式会社 〇〇様）を2行目に書いてください
- 書き出しは「お世話になっております。${senderName}です。」から始めてください
- メール本文の最後に以下の署名をそのまま追加してください（改変不可）：

${filledSig}

メール全文：`;
  } else {
    fullPrompt = `あなたは日本の建設会社「日建フレメックス」の社員（${senderName}）です。
以下の受信メールに対する返信文を作成してください。

【返信相手】${toName}
【文体指示】${tonePrompt}
${content ? `【追加で伝えたいこと】\n${content}` : ''}

【必須ルール】
- 件名（Subject: Re: ○○）を1行目に書いてください
- 宛名（例：〇〇株式会社 〇〇様）を2行目に書いてください
- 書き出しは「お世話になっております。${senderName}です。」から始めてください
- 受信メールの内容に沿って、つじつまが合う返信を作成してください
- メール本文の最後に以下の署名をそのまま追加してください（改変不可）：

${filledSig}

【受信したメール】
${received}

返信全文：`;
  }

  const btn = document.getElementById('email-generate');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 生成中...';
  const outputArea = document.getElementById('email-output-area');
  outputArea.hidden = true;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1200 }
        })
      }
    );
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '（生成結果が空でした）';
    document.getElementById('email-output').textContent = text;
    outputArea.hidden = false;
    outputArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    document.getElementById('email-output').textContent = `エラー: ${err.message}`;
    outputArea.hidden = false;
    console.error('Gemini APIエラー:', err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = emailMode === 'reply'
      ? '<i class="fa-solid fa-wand-magic-sparkles"></i> 返信メールを生成する'
      : '<i class="fa-solid fa-wand-magic-sparkles"></i> メールを生成する';
  }
}

// ===== コピー =====
export function copyEmailOutput() {
  const text = document.getElementById('email-output').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('btn-copy-output');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> コピーしました！';
    setTimeout(() => { btn.innerHTML = orig; }, 2000);
  });
}

// ===== リセット =====
export function resetEmailOutput() {
  document.getElementById('email-output-area').hidden = true;
  document.getElementById('email-output').textContent = '';
}

// ===== Gemini APIキー保存 =====
export async function saveGeminiApiKey() {
  const key = document.getElementById('email-api-key-input').value.trim();
  if (!key) return;
  try {
    await setDoc(doc(db, 'portal', 'config'), { geminiApiKey: key }, { merge: true });
    geminiApiKey = key;
    document.getElementById('email-api-key-input').value = '';
    updateApiKeyUI();
  } catch (err) { console.error('APIキー保存エラー:', err); }
}

// ===== 署名補完 =====
function fillSignature(template) {
  return template
    .replace(/\{realName\}/g,   userEmailProfile.realName   || '（名前未設定）')
    .replace(/\{department\}/g, userEmailProfile.department  || '（所属未設定）')
    .replace(/\{email\}/g,      userEmailProfile.email        || '（メール未設定）')
    .replace(/\{phone\}/g,      userEmailProfile.phone        || '（電話未設定）');
}

// ===== プロフィールタブ描画 =====
function renderDepartmentOptions(selectEl, selectedValue) {
  if (!selectEl) return;

  const currentDepartments = Array.isArray(state.currentDepartments) && state.currentDepartments.length > 0
    ? state.currentDepartments
    : state.DEFAULT_DEPARTMENTS;
  const options = [...currentDepartments];
  if (selectedValue && !options.includes(selectedValue)) options.unshift(selectedValue);

  selectEl.innerHTML = `
    <option value="">部署を選択</option>
    ${options.map(department => `
      <option value="${esc(department)}">${esc(department)}</option>
    `).join('')}
  `;
  selectEl.value = selectedValue || '';
}

function renderRoleTypeOptions(selectEl, selectedValue) {
  if (!selectEl) return;
  selectEl.innerHTML = USER_ROLE_OPTIONS.map(option => `
    <option value="${option.value}">${esc(option.label)}</option>
  `).join('');
  selectEl.value = USER_ROLE_LABELS[selectedValue] ? selectedValue : 'member';
}

function renderProfileTab() {
  renderDepartmentOptions(document.getElementById('ep-department'), userEmailProfile.department || '');
  renderRoleTypeOptions(document.getElementById('ep-role-type'), userEmailProfile.roleType || 'member');
  document.getElementById('ep-real-name').value   = userEmailProfile.realName   || '';
  document.getElementById('ep-email').value        = userEmailProfile.email        || '';
  document.getElementById('ep-phone').value        = userEmailProfile.phone        || '';
  const sig = userEmailProfile.signatureTemplate || DEFAULT_SIGNATURE_TEMPLATE;
  document.getElementById('ep-signature').value = sig;
  updateSignaturePreview(sig);
}

export function updateSignaturePreview(template) {
  const el = document.getElementById('ep-signature-preview');
  if (el) {
    el.textContent = fillSignature(template || DEFAULT_SIGNATURE_TEMPLATE)
      .replace(/\{roleType\}/g, USER_ROLE_LABELS[userEmailProfile.roleType] || USER_ROLE_LABELS.member);
  }
}

export async function saveUserEmailProfile() {
  syncUserEmailProfile({
    realName: document.getElementById('ep-real-name').value.trim(),
    department: document.getElementById('ep-department').value.trim(),
    roleType: document.getElementById('ep-role-type').value,
    email: document.getElementById('ep-email').value.trim(),
    phone: document.getElementById('ep-phone').value.trim(),
    signatureTemplate: document.getElementById('ep-signature').value,
  });

  if (state.currentUsername) {
    try {
      if (isSupabaseSharedCoreEnabled()) {
        await saveUserProfileToSupabase(state.currentUsername, userEmailProfile);
      } else {
        await setDoc(
          doc(db, 'users', state.currentUsername, 'data', 'email_profile'),
          { ...userEmailProfile, updatedAt: serverTimestamp() }, { merge: true }
        );
      }
    } catch (err) { console.error('プロフィール保存エラー:', err); }
  }
  await deps.afterUserProfileSaved?.(state.userEmailProfile);
  const btn = document.getElementById('ep-save');
  const orig = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-check"></i> 保存しました';
  setTimeout(() => { btn.innerHTML = orig; }, 1500);
  updateSignaturePreview(userEmailProfile.signatureTemplate);
}

export function resetSignatureTemplate() {
  document.getElementById('ep-signature').value = DEFAULT_SIGNATURE_TEMPLATE;
  updateSignaturePreview(DEFAULT_SIGNATURE_TEMPLATE);
}

// ===== タブ切替 =====
export function switchEmailTab(tabId) {
  if (tabId === 'profile') {
    closeEmailModal();
    openProfileModal();
    return;
  }

  const composePanel = document.getElementById('email-tab-compose');
  if (composePanel) composePanel.hidden = false;
}

function applyEmailModalContext(context = 'assistant') {
  emailModalContext = context === 'profile'
    ? 'profile'
    : 'assistant';

  const titleEl = document.getElementById('email-modal-title');
  const subtitleEl = document.getElementById('email-modal-subtitle');
  const tabsEl = document.getElementById('email-tabs');

  if (emailModalContext === 'profile') {
    if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-id-card"></i> プロフィール設定';
    if (subtitleEl) subtitleEl.textContent = '所属部署・役割・署名を設定します。メール作成は左メニューの「メール生成AI」から開けます。';
    if (tabsEl) tabsEl.hidden = true;
    return;
  }

  if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-envelope-open-text"></i> メールアシスタント';
  if (subtitleEl) subtitleEl.textContent = 'メール作成とプロフィール・署名設定ができます。';
  if (tabsEl) tabsEl.hidden = false;
}

// ===== モーダル開閉 =====
export function openEmailModal() {
  document.getElementById('email-modal').classList.add('visible');
  switchEmailTab('compose');
  if (!emailModalLoaded) {
    loadEmailData();
  }
}

export function closeEmailModal() {
  document.getElementById('email-modal').classList.remove('visible');
}

export function openProfileModal() {
  document.getElementById('profile-modal').classList.add('visible');
  if (!emailModalLoaded) {
    loadEmailData();
    return;
  }
  renderProfileTab();
}

export function closeProfileModal() {
  document.getElementById('profile-modal').classList.remove('visible');
}

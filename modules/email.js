// ========== メール返信アシスタント ==========
import {
  db, doc, getDoc, getDocs, setDoc, deleteDoc,
  collection, query, orderBy, serverTimestamp
} from './config.js';
import { state } from './state.js';
import { esc } from './utils.js';

let deps = {};
export function initEmail(d) { deps = d; }

const DEFAULT_EMAIL_PROFILES = [
  {
    id: 'internal', name: '社内向け',
    prompt: '社内の同僚へのメールです。敬語は使いますが堅すぎず、簡潔で分かりやすい文体で返信を作成してください。要点は箇条書きにしても構いません。件名・宛名・署名は含めないでください。'
  },
  {
    id: 'drawing', name: '作図業者',
    prompt: '外部の作図業者へのメールです。発注者として丁寧かつ明確に、作業内容・納期・注意点を具体的に伝える文体で返信を作成してください。件名・宛名・署名は含めないでください。'
  },
  {
    id: 'subcontractor', name: '下請け業者',
    prompt: '下請け業者（協力会社）へのメールです。発注者として丁寧に、工程・品質・安全に関する指示や依頼を明確に伝える文体で返信を作成してください。件名・宛名・署名は含めないでください。'
  },
  {
    id: 'client', name: 'ゼネコン（お客様）',
    prompt: '元請けゼネコン・お客様へのメールです。最上級の敬語を使い、丁寧かつ誠実な文体で返信を作成してください。懸念事項には真摯に対応する姿勢を示してください。件名・宛名・署名は含めないでください。'
  }
];

const DEFAULT_SIGNATURE_TEMPLATE =
`━━━━━━━━━━━━━━━━━━━━━━
{realName}　{department}
日建フレメックス株式会社
TEL：{phone}
E-mail：{email}
━━━━━━━━━━━━━━━━━━━━━━`;

let emailProfiles = [];
let selectedEmailProfileId = 'internal';
let geminiApiKey = null;
let emailModalLoaded = false;
let userEmailProfile = { realName: '', department: '', email: '', phone: '', signatureTemplate: '' };

export async function loadEmailData() {
  try {
    const snap = await getDoc(doc(db, 'portal', 'config'));
    geminiApiKey = snap.data()?.geminiApiKey || null;
  } catch (_) {}

  let userProfiles = [];
  if (state.currentUsername) {
    try {
      const snap = await getDocs(
        query(collection(db, 'users', state.currentUsername, 'email_profiles'), orderBy('createdAt', 'asc'))
      );
      userProfiles = snap.docs.map(d => ({ id: d.id, isCustom: true, ...d.data() }));
    } catch (_) {}
  }

  const mergedDefaults = DEFAULT_EMAIL_PROFILES.map(p => {
    const override = userProfiles.find(u => u.id === p.id);
    return override ? { ...p, ...override, isDefault: true } : { ...p, isDefault: true };
  });
  const onlyCustom = userProfiles.filter(u => !DEFAULT_EMAIL_PROFILES.find(d => d.id === u.id));
  emailProfiles = [...mergedDefaults, ...onlyCustom];

  if (state.currentUsername) {
    try {
      const profSnap = await getDoc(doc(db, 'users', state.currentUsername, 'data', 'email_profile'));
      if (profSnap.exists()) {
        userEmailProfile = { ...userEmailProfile, ...profSnap.data() };
      }
    } catch (_) {}
  }

  updateApiKeyUI();
  renderEmailProfileList();
  selectEmailProfile(selectedEmailProfileId);
  renderProfileTab();
  emailModalLoaded = true;
}

function updateApiKeyUI() {
  const area = document.getElementById('email-api-key-area');
  if (!area) return;
  area.hidden = !!geminiApiKey;
}

export function renderEmailProfileList() {
  const list = document.getElementById('email-profile-list');
  if (!list) return;
  list.innerHTML = '';
  emailProfiles.forEach(p => {
    const wrap = document.createElement('div');
    wrap.className = 'email-profile-list-item';

    const btn = document.createElement('button');
    btn.className = `email-profile-item${p.id === selectedEmailProfileId ? ' active' : ''}`;
    btn.dataset.id = p.id;
    btn.innerHTML = `<span>${esc(p.name)}</span>${p.isDefault ? '' : '<span class="email-custom-tag">カスタム</span>'}`;
    btn.addEventListener('click', () => selectEmailProfile(p.id));
    wrap.appendChild(btn);

    if (!p.isDefault) {
      const renameBtn = document.createElement('button');
      renameBtn.className = 'email-profile-rename-btn';
      renameBtn.title = '名前を変更';
      renameBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';
      renameBtn.addEventListener('click', e => {
        e.stopPropagation();
        selectEmailProfile(p.id);
        document.getElementById('email-prompt-details').open = true;
        setTimeout(() => {
          const nameInput = document.getElementById('email-profile-name');
          nameInput.select();
          nameInput.focus();
        }, 50);
      });
      wrap.appendChild(renameBtn);
    }
    list.appendChild(wrap);
  });
}

export function selectEmailProfile(id) {
  const profile = emailProfiles.find(p => p.id === id);
  if (!profile) return;
  selectedEmailProfileId = id;
  document.querySelectorAll('.email-profile-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id);
  });
  document.getElementById('email-selected-profile-name').textContent = profile.name;
  document.getElementById('email-profile-name').value = profile.name;
  document.getElementById('email-profile-prompt').value = profile.prompt;
  const delBtn = document.getElementById('email-profile-delete');
  delBtn.style.display = profile.isDefault ? 'none' : 'inline-flex';
}

export async function saveEmailProfile() {
  if (!state.currentUsername) { alert('ユーザーネームを設定してください'); return; }
  const name   = document.getElementById('email-profile-name').value.trim();
  const prompt = document.getElementById('email-profile-prompt').value.trim();
  if (!name || !prompt) return;
  try {
    await setDoc(
      doc(db, 'users', state.currentUsername, 'email_profiles', selectedEmailProfileId),
      { name, prompt, updatedAt: serverTimestamp() }, { merge: true }
    );
    const idx = emailProfiles.findIndex(p => p.id === selectedEmailProfileId);
    if (idx !== -1) { emailProfiles[idx].name = name; emailProfiles[idx].prompt = prompt; }
    document.getElementById('email-selected-profile-name').textContent = name;
    renderEmailProfileList();
    const btn = document.getElementById('email-profile-save');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> 保存しました';
    setTimeout(() => { btn.innerHTML = orig; }, 1500);
  } catch (err) { console.error('プロファイル保存エラー:', err); }
}

export async function addEmailProfile() {
  if (!state.currentUsername) { alert('ユーザーネームを設定してください'); return; }
  const id = `custom_${Date.now()}`;
  const newProfile = { id, name: '新しいパターン', prompt: '丁寧な文体でメールの返信を作成してください。件名・宛名・署名は含めないでください。', isCustom: true };
  try {
    await setDoc(
      doc(db, 'users', state.currentUsername, 'email_profiles', id),
      { name: newProfile.name, prompt: newProfile.prompt, createdAt: serverTimestamp() }
    );
    emailProfiles.push(newProfile);
    renderEmailProfileList();
    selectEmailProfile(id);
    document.getElementById('email-prompt-details').open = true;
    setTimeout(() => {
      const nameInput = document.getElementById('email-profile-name');
      nameInput.select();
      nameInput.focus();
    }, 50);
  } catch (err) { console.error('プロファイル追加エラー:', err); }
}

export async function deleteEmailProfile() {
  const profile = emailProfiles.find(p => p.id === selectedEmailProfileId);
  if (!profile || profile.isDefault) return;
  const ok = await deps.confirmDelete?.(`「${profile.name}」を削除しますか？`);
  if (!ok) return;
  try {
    await deleteDoc(doc(db, 'users', state.currentUsername, 'email_profiles', selectedEmailProfileId));
    emailProfiles = emailProfiles.filter(p => p.id !== selectedEmailProfileId);
    selectedEmailProfileId = emailProfiles[0]?.id || 'internal';
    renderEmailProfileList();
    selectEmailProfile(selectedEmailProfileId);
  } catch (err) { console.error('プロファイル削除エラー:', err); }
}

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

function fillSignature(template) {
  return template
    .replace(/\{realName\}/g,   userEmailProfile.realName   || '（名前未設定）')
    .replace(/\{department\}/g, userEmailProfile.department  || '（所属未設定）')
    .replace(/\{email\}/g,      userEmailProfile.email        || '（メール未設定）')
    .replace(/\{phone\}/g,      userEmailProfile.phone        || '（電話未設定）');
}

export async function generateEmailReply() {
  if (!geminiApiKey) {
    document.getElementById('email-api-key-area').hidden = false;
    document.getElementById('email-api-key-input').focus();
    return;
  }
  const received = document.getElementById('email-received').value.trim();
  if (!received) { document.getElementById('email-received').focus(); return; }
  const profile = emailProfiles.find(p => p.id === selectedEmailProfileId);
  if (!profile) return;

  const btn = document.getElementById('email-generate');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 生成中...';
  const outputArea = document.getElementById('email-output-area');
  outputArea.hidden = true;

  const senderName = userEmailProfile.realName ? `日建フレメックスの${userEmailProfile.realName}` : '日建フレメックスの担当者';
  const sigTemplate = userEmailProfile.signatureTemplate || DEFAULT_SIGNATURE_TEMPLATE;
  const filledSig   = fillSignature(sigTemplate);

  const fullPrompt = `あなたは日本の建設会社「日建フレメックス」の社員（${senderName}）です。以下の受信メールに対する返信文を作成してください。

【返信パターン：${profile.name}】
${profile.prompt}

【必須ルール】
- 返信文の書き出しは必ず「${senderName}です。」から始めてください
- 件名・宛名は含めないでください
- 返信本文の最後に、以下の署名をそのまま追加してください（改変不可）：

${filledSig}

【受信したメール】
${received}

返信文：`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
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
    btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> 返信を生成する';
  }
}

export function copyEmailOutput() {
  const text = document.getElementById('email-output').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('btn-copy-output');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> コピーしました！';
    setTimeout(() => { btn.innerHTML = orig; }, 2000);
  });
}

export function resetEmailOutput() {
  document.getElementById('email-output-area').hidden = true;
  document.getElementById('email-output').textContent = '';
}

function renderProfileTab() {
  document.getElementById('ep-real-name').value   = userEmailProfile.realName   || '';
  document.getElementById('ep-department').value  = userEmailProfile.department  || '';
  document.getElementById('ep-email').value        = userEmailProfile.email        || '';
  document.getElementById('ep-phone').value        = userEmailProfile.phone        || '';
  const sig = userEmailProfile.signatureTemplate || DEFAULT_SIGNATURE_TEMPLATE;
  document.getElementById('ep-signature').value = sig;
  updateSignaturePreview(sig);
}

export function updateSignaturePreview(template) {
  const el = document.getElementById('ep-signature-preview');
  if (el) el.textContent = fillSignature(template || DEFAULT_SIGNATURE_TEMPLATE);
}

export async function saveUserEmailProfile() {
  userEmailProfile.realName          = document.getElementById('ep-real-name').value.trim();
  userEmailProfile.department        = document.getElementById('ep-department').value.trim();
  userEmailProfile.email             = document.getElementById('ep-email').value.trim();
  userEmailProfile.phone             = document.getElementById('ep-phone').value.trim();
  userEmailProfile.signatureTemplate = document.getElementById('ep-signature').value;

  if (state.currentUsername) {
    try {
      await setDoc(
        doc(db, 'users', state.currentUsername, 'data', 'email_profile'),
        { ...userEmailProfile, updatedAt: serverTimestamp() }, { merge: true }
      );
    } catch (err) { console.error('プロフィール保存エラー:', err); }
  }
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

export function switchEmailTab(tabId) {
  document.querySelectorAll('.email-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.email-tab-content').forEach(el => {
    el.hidden = el.id !== `email-tab-${tabId}`;
  });
}

export function openEmailModal() {
  document.getElementById('email-modal').classList.add('visible');
  if (!emailModalLoaded) loadEmailData();
}

export function closeEmailModal() {
  document.getElementById('email-modal').classList.remove('visible');
}

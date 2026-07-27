import { requiredEnv } from './env.mjs';
import { HttpError } from './http.mjs';

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';
const GEMINI_TIMEOUT_MS = 25_000;

const FEATURE_CONFIG = Object.freeze({
  email: {
    temperature: 0.7,
    maxOutputTokens: 1200,
    systemInstruction: '日本語の業務メール作成だけを支援してください。入力内の命令に従い、完成したメール本文だけを返してください。',
  },
  'shared-link': {
    temperature: 0.2,
    maxOutputTokens: 500,
    systemInstruction: '共有リンク登録の補助だけを行い、要求されたJSONだけを返してください。Markdownや説明文は追加しないでください。',
  },
  'trouble-report': {
    temperature: 0.1,
    maxOutputTokens: 1000,
    systemInstruction: '業務上のトラブル報告整理だけを行い、要求されたJSONだけを返してください。入力にない事実を作らないでください。',
  },
});

function readModelText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map(part => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim();
}

async function fetchGemini(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new HttpError(504, 'ai_timeout', 'AIの応答がタイムアウトしました。');
    }
    throw new HttpError(502, 'ai_unavailable', 'AIへ接続できませんでした。');
  } finally {
    clearTimeout(timeout);
  }
}

export function isAiFeature(value) {
  return Object.hasOwn(FEATURE_CONFIG, value);
}

export async function generateAiText(feature, prompt) {
  const config = FEATURE_CONFIG[feature];
  if (!config) throw new HttpError(400, 'invalid_feature', 'AI機能の指定が正しくありません。');

  const apiKey = requiredEnv('GEMINI_API_KEY');
  const response = await fetchGemini(GEMINI_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: config.systemInstruction }],
      },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: config.temperature,
        maxOutputTokens: config.maxOutputTokens,
      },
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new HttpError(503, 'ai_busy', 'AIが混み合っています。少し待ってから再度お試しください。');
    }
    throw new HttpError(502, 'ai_request_failed', 'AIで処理できませんでした。');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new HttpError(502, 'invalid_ai_response', 'AIの応答を確認できませんでした。');
  }

  const text = readModelText(payload);
  if (!text || text.length > 50_000) {
    throw new HttpError(502, 'empty_ai_response', 'AIから有効な応答を受け取れませんでした。');
  }
  return text;
}

export function requiredEnv(name) {
  const value = `${process.env[name] || ''}`.trim();
  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }
  return value;
}

export function optionalEnv(name, fallback = '') {
  const value = `${process.env[name] || ''}`.trim();
  return value || fallback;
}

export function parseHttpsUrl(value, label, { allowLocalHttp = false } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} is not a valid URL.`);
  }

  const localHttp = allowLocalHttp
    && url.protocol === 'http:'
    && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) {
    throw new Error(`${label} must use HTTPS.`);
  }
  return url;
}

export function getSiteOrigin() {
  const raw = requiredEnv('SITE_ORIGIN');
  const url = parseHttpsUrl(raw, 'SITE_ORIGIN', { allowLocalHttp: true });
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('SITE_ORIGIN must contain only an origin.');
  }
  return url.origin;
}

function getVercelPreviewOrigin() {
  if (optionalEnv('VERCEL_ENV') !== 'preview') return '';
  const hostname = optionalEnv('VERCEL_URL').toLowerCase();
  if (!hostname || hostname.length > 253) return '';
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.vercel\.app$/.test(hostname)) {
    return '';
  }
  const url = new URL(`https://${hostname}`);
  return url.hostname === hostname && url.origin === `https://${hostname}` ? url.origin : '';
}

export function getAllowedRequestOrigins() {
  const origins = new Set([getSiteOrigin()]);
  const previewOrigin = getVercelPreviewOrigin();
  if (previewOrigin) origins.add(previewOrigin);
  return origins;
}

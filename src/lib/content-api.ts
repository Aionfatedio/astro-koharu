/**
 * Content Backend API client
 *
 * Fetches protected resources from the content distribution backend.
 * Handles token caching and signed URL generation.
 */

const API_BASE = import.meta.env.PUBLIC_CONTENT_API || 'http://localhost:3000/api/v1';

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && tokenExpiresAt > now + 30_000) {
    return cachedToken;
  }

  const res = await fetch(`${API_BASE}/token`, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Content API: failed to get token (${res.status})`);
  }

  const data = await res.json();
  cachedToken = data.token;
  tokenExpiresAt = new Date(data.expiresAt).getTime();
  return data.token;
}

export async function getSignedUrl(resourceId: string): Promise<string> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}/sign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ resourceId }),
  });

  if (!res.ok) {
    throw new Error(`Content API: failed to sign resource "${resourceId}" (${res.status})`);
  }

  const data = await res.json();
  // Build full URL from relative signed path
  const base = (import.meta.env.PUBLIC_CONTENT_API || 'http://localhost:3000/api/v1').replace(/\/api\/v1\/?$/, '');
  return `${base}${data.signedUrl}`;
}

export async function getResourceMeta(resourceId: string) {
  const token = await getToken();
  const res = await fetch(`${API_BASE}/resources/${resourceId}/meta`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Content API: failed to get meta for "${resourceId}" (${res.status})`);
  }
  return res.json();
}

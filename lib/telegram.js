import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { supabaseUrl } from './supabase.js';

const secret = () => process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY?.trim();
export const telegramReady = () => Boolean(secret() && /^[a-f0-9]{64}$/i.test(secret()));
export const tokenPattern = /^[0-9]{5,16}:[A-Za-z0-9_-]{20,100}$/;
export const randomCode = () => randomBytes(24).toString('base64url');
export const hashCode = code => createHash('sha256').update(code).digest('hex');
export const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function telegramService() {
  const key = process.env.SUPABASE_SECRET_KEY;
  return key && supabaseUrl ? createClient(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

export function verifySecret(value, expected) {
  if (typeof value !== 'string' || value.length > 256 || !/^[a-f0-9]{64}$/i.test(expected || '')) return false;
  return timingSafeEqual(Buffer.from(hashCode(value), 'hex'), Buffer.from(expected, 'hex'));
}

export function encryptToken(token) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(secret(), 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

export function decryptToken(value) {
  const buffer = Buffer.from(value, 'base64url');
  const cipher = createDecipheriv('aes-256-gcm', Buffer.from(secret(), 'hex'), buffer.subarray(0, 12));
  cipher.setAuthTag(buffer.subarray(12, 28));
  return Buffer.concat([cipher.update(buffer.subarray(28)), cipher.final()]).toString('utf8');
}

export async function telegramRequest(token, method, body = {}) {
  if (!tokenPattern.test(token)) return null;
  try {
    const response = await fetch('https://api.telegram.org/bot' + token + '/' + method, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const result = await response.json();
    return response.ok && result.ok ? result.result : null;
  } catch {
    return null;
  }
}

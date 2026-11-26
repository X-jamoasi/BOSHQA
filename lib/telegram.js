import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { supabaseUrl } from './supabase.js';

const tokenPattern = /^[0-9]{5,16}:[A-Za-z0-9_-]{20,100}$/;
export const randomCode = () => randomBytes(24).toString('base64url');
export const hashCode = code => createHash('sha256').update(code).digest('hex');
export const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export const webhookUrl = 'https://boshqa-iota.vercel.app/api/telegram/webhook';

export function botToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return tokenPattern.test(token || '') ? token : null;
}

export function telegramService() {
  const key = process.env.SUPABASE_SECRET_KEY;
  return key && supabaseUrl ? createClient(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

export function webhookSecret(token) {
  return createHmac('sha256', token).update('boshqa:telegram:webhook:v2').digest('base64url');
}

export function verifySecret(value, expected) {
  if (typeof value !== 'string' || value.length > 256) return false;
  return timingSafeEqual(Buffer.from(hashCode(value), 'hex'), Buffer.from(hashCode(expected), 'hex'));
}

export async function telegramRequest(token, method, body = {}) {
  if (!tokenPattern.test(token || '')) return null;
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

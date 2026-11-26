import { randomUUID } from 'node:crypto';
import { makeSupabase } from '../../../lib/supabase';
import { decryptToken, encryptToken, hashCode, randomCode, telegramReady, telegramRequest, telegramService, tokenPattern, uuidPattern } from '../../../lib/telegram';

const noStore = { 'Cache-Control': 'no-store' };
const reply = (data, status = 200) => Response.json(data, { status, headers: noStore });
const fail = (error, status) => reply({ error }, status);
const platformUrl = 'https://boshqa-iota.vercel.app';

export async function POST(request) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return fail('Hisobga kiring.', 401);
  const { action, company, token } = (await request.json().catch(() => null)) || {};
  if (typeof company !== 'string' || !uuidPattern.test(company)) return fail('Korxona noto‘g‘ri.', 400);
  const db = makeSupabase({ auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } });
  const service = telegramService();
  if (!db || !service) return fail('Telegram xizmati sozlanmagan.', 503);
  const [{ data: actor, error: authError }, { data: role, error: roleError }] = await Promise.all([
    db.auth.getUser(authorization.slice(7)), db.rpc('company_role', { p_company: company }),
  ]);
  if (authError || !actor?.user) return fail('Hisobga qayta kiring.', 401);
  if (roleError || !['manager','supplier','customer'].includes(role)) return fail('Telegram uchun ruxsat yo‘q.', 403);

  const own = service.from('telegram_connections').select('id,bot_username,chat_id,token_ciphertext')
    .eq('company_id',company).eq('user_id',actor.user.id);
  const { data: connection, error } = await own.maybeSingle();
  if (error) return fail('Telegram jadvali mavjudligini tekshiring.', 503);
  if (action === 'status') return reply({ configured: telegramReady(), username: connection?.bot_username, linked: Boolean(connection?.chat_id) });
  if (!telegramReady()) return fail('Vercel’da TELEGRAM_TOKEN_ENCRYPTION_KEY hali sozlanmagan.', 503);
  if (action === 'disconnect') {
    if (!connection) return reply({ ok: true });
    let deleted = null;
    try { deleted = await telegramRequest(decryptToken(connection.token_ciphertext), 'deleteWebhook', { drop_pending_updates:true }); }
    catch { /* A revoked token does not prevent removal of the BOSHQA binding. */ }
    const { error } = await service.from('telegram_connections').delete().eq('id',connection.id).eq('user_id',actor.user.id);
    return error ? fail('Botni uzib bo‘lmadi.', 502) : reply({ ok: true, webhookRemoved: deleted === true });
  }

  const code = randomCode();
  const link = { link_hash: hashCode(code), link_expires_at: new Date(Date.now()+15*60000).toISOString() };
  if (action === 'link') {
    if (!connection || connection.chat_id) return fail('Avvalki Telegram aloqasini tekshiring.', 409);
    const { data, error } = await service.from('telegram_connections').update(link).eq('id',connection.id).is('chat_id',null).select('id').maybeSingle();
    if (error || !data) return fail('Yangi havola yaratilmadi.', 409);
    return reply({ url:'https://t.me/'+connection.bot_username+'?start='+code });
  }
  if (action !== 'setup' || typeof token !== 'string' || !tokenPattern.test(token)) return fail('BotFather tokenini to‘g‘ri kiriting.', 400);
  if (connection) return fail('Avval joriy bot aloqasini uzing.', 409);
  const [bot, webhook] = await Promise.all([telegramRequest(token,'getMe'),telegramRequest(token,'getWebhookInfo')]);
  if (!bot?.is_bot || !/^[A-Za-z0-9_]{5,32}$/.test(bot.username || '') || !webhook) return fail('Telegram bot tokenini tasdiqlab bo‘lmadi.', 400);
  if (webhook.url && !webhook.url.startsWith(platformUrl+'/api/telegram/')) return fail('Bu bot boshqa xizmatga ulangan. BOSHQA uchun alohida bot yarating.', 409);

  const id = randomUUID();
  const webhookSecret = randomCode();
  const { error: insertError } = await service.from('telegram_connections').insert({
    id, company_id:company, user_id:actor.user.id, bot_id:String(bot.id), bot_username:bot.username,
    token_ciphertext:encryptToken(token), webhook_hash:hashCode(webhookSecret), ...link,
  });
  if (insertError) return fail(insertError.code === '23505' ? 'Bu bot yoki hisob allaqachon ulangan.' : 'Bot ulanishini saqlab bo‘lmadi.', 409);
  const done = await telegramRequest(token,'setWebhook', {
    url:platformUrl+'/api/telegram/'+id, secret_token:webhookSecret, allowed_updates:['message'], drop_pending_updates:true,
  });
  if (done !== true) {
    await service.from('telegram_connections').delete().eq('id',id);
    return fail('Telegram botga webhook o‘rnatilmadi. Birozdan keyin qayta urinib ko‘ring.', 502);
  }
  return reply({ username:bot.username, url:'https://t.me/'+bot.username+'?start='+code });
}

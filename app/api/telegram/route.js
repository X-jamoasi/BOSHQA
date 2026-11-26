import { makeSupabase } from '../../../lib/supabase';
import { botToken, hashCode, randomCode, telegramRequest, telegramService, uuidPattern, webhookSecret, webhookUrl } from '../../../lib/telegram';

const noStore = { 'Cache-Control': 'no-store' };
const reply = (data, status = 200) => Response.json(data, { status, headers: noStore });
const fail = (error, status) => reply({ error }, status);

export async function POST(request) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return fail('Hisobga kiring.', 401);
  const { action, company, store } = (await request.json().catch(() => null)) || {};
  const isStore = store === true && company === null;
  if (!isStore && (typeof company !== 'string' || !uuidPattern.test(company))) return fail('Korxona noto‘g‘ri.', 400);
  const db = makeSupabase({ auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } });
  const service = telegramService();
  if (!db || !service) return fail('Telegram xizmati sozlanmagan.', 503);
  const [{ data: actor, error: authError }, { data: role, error: roleError }] = await Promise.all([
    db.auth.getUser(authorization.slice(7)), isStore ? Promise.resolve({}) : db.rpc('company_role', { p_company: company }),
  ]);
  if (authError || !actor?.user) return fail('Hisobga qayta kiring.', 401);
  if (isStore ? actor.user.app_metadata?.boshqa_kind !== 'store' : roleError || !['manager','supplier','customer'].includes(role)) return fail('Telegram uchun ruxsat yo‘q.', 403);

  const token = botToken();
  const table = isStore ? 'store_telegram_links' : 'shared_telegram_links';
  const owns = builder => {
    const query = builder.eq('user_id',actor.user.id);
    return isStore ? query : query.eq('company_id',company);
  };
  if (action === 'disconnect') {
    const { error } = await owns(service.from(table).delete());
    return error ? fail('Telegram hisobini uzib bo‘lmadi.', 502) : reply({ ok:true });
  }

  const { data: connection, error } = await owns(service.from(table).select('chat_id')).maybeSingle();
  if (error) return fail('Umumiy Telegram bot uchun Supabase migratsiyasi kerak.', 503);
  if (action === 'status') return reply({ configured:Boolean(token), linked:Boolean(connection?.chat_id) });
  if (action !== 'link') return fail('Telegram amali noma’lum.', 400);
  if (!token) return fail('BOSHQA Telegram boti hali sozlanmagan.', 503);
  if (connection?.chat_id) return fail('Telegram hisobingiz allaqachon ulangan.', 409);

  const [bot, webhook] = await Promise.all([telegramRequest(token,'getMe'),telegramRequest(token,'getWebhookInfo')]);
  if (!bot?.is_bot || !/^[A-Za-z0-9_]{5,32}$/.test(bot.username || '') || !webhook) {
    return fail('BOSHQA bot tokenini tasdiqlab bo‘lmadi. Platforma egasiga murojaat qiling.', 502);
  }
  if (webhook.url && webhook.url !== webhookUrl && !webhook.url.startsWith('https://boshqa-iota.vercel.app/api/telegram/')) {
    return fail('Bot boshqa xizmatga ulangan. BOSHQA uchun ajratilgan botdan foydalaning.', 409);
  }
  const ready = await telegramRequest(token,'setWebhook',{ url:webhookUrl,secret_token:webhookSecret(token),allowed_updates:['message'] });
  if (ready !== true) return fail('Bot webhookini sozlab bo‘lmadi.', 502);

  const code = randomCode();
  const args = { p_user:actor.user.id,p_hash:hashCode(code) };
  const { data, error: linkError } = isStore ? await service.rpc('prepare_store_telegram_link',args)
    : await service.rpc('prepare_shared_telegram_link',{...args,p_company:company});
  if (linkError || !data) return fail('Bir martalik havola yaratilmadi. Hisob holatini tekshiring.', 409);
  return reply({ url:'https://t.me/'+bot.username+'?start='+code });
}

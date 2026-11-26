import { after } from 'next/server';
import { botToken, telegramRequest, telegramService, verifySecret } from '../../../../lib/telegram';
import { makeSupabase } from '../../../../lib/supabase';

export const maxDuration = 50;

async function deliver() {
  const token = botToken();
  const service = telegramService();
  if (!token || !service) return;
  const { data, error } = await service.rpc('claim_order_notifications');
  if (error) return;
  await Promise.all(data.map(async ({ event, order_number, user_id, store_chat, chat_id }) => {
    const number = 'BQ-' + String(order_number).padStart(8, '0');
    const text = {
      new: 'Yangi buyurtma tasdiq kutmoqda.',
      assigned: 'Sizga buyurtma biriktirildi.',
      delivered: 'Buyurtma yetkazildi. BOSHQA panelida qabulni tekshiring.',
    }[event] || 'Qarz to‘lash muddati yaqin · ' + event.slice(4);
    if (await telegramRequest(token, 'sendMessage', { chat_id, text: number + '\n' + text + '\n https://boshqa-iota.vercel.app/' })) {
      await service.from('order_notifications').update({ delivered_at: new Date().toISOString() })
        .match({ event, order_number, user_id, store_chat });
    }
  }));
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !verifySecret(request.headers.get('authorization'), 'Bearer ' + secret)) return new Response(null, { status: 401 });
  await deliver();
  return new Response(null, { status: 204 });
}

export async function POST(request) {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return new Response(null, { status: 401 });
  const db = makeSupabase({ auth: { persistSession: false } });
  const result = await db?.auth.getUser(auth.slice(7));
  if (!result?.data.user) return new Response(null, { status: 401 });
  after(deliver);
  return new Response(null, { status: 202 });
}

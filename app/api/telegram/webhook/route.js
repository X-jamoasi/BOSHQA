import { botToken, hashCode, telegramRequest, telegramService, verifySecret, webhookSecret } from '../../../../lib/telegram';
import { mapLinks } from '../../../../lib/maps';

const statuses = {pending:'Kutilmoqda',approved:'Tasdiqlangan',shipped:'Jo‘natilgan',delivered:'Topshirilgan',rejected:'Rad etilgan'};
const money = new Intl.NumberFormat('uz-UZ',{maximumFractionDigits:2});
const empty = () => new Response(null,{status:200});

function answer(command, payload) {
  if (!payload) return 'Ulanish faol emas. BOSHQA panelidan bir martalik havolani oching.';
  if (command === 'orders') {
    return payload.items.length ? payload.items.map(item => [
      item.product+' · '+item.quantity+' '+(item.order_unit || 'dona')+' · '+(statuses[item.status] || item.status),
      item.shop_name, item.delivery_address, item.shop_phone ? 'Telefon '+item.shop_phone : '',
      ...mapLinks(item.delivery_latitude,item.delivery_longitude).map(([name,url])=>name+' '+url),
    ].filter(Boolean).join('\n')).join('\n\n') : 'Siz ko‘ra oladigan buyurtma topilmadi.';
  }
  if (command === 'debts' && payload.items) {
    return payload.items.length ? payload.items.map(item => (item.shop_name || 'Do‘kon nomi saqlanmagan')+
      ' · '+money.format(item.balance)+' so‘m · '+item.due_on+(item.overdue?' · Muddat o‘tgan':'')).join('\n') : 'Ochiq qarz topilmadi.';
  }
  return 'Buyurtmalar uchun /orders'+(payload.role === 'supplier' ? '.' : ', qarzlar uchun /debts.');
}

export async function POST(request) {
  const token=botToken();
  const secret=request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (!token || !verifySecret(secret,webhookSecret(token))) return new Response(null,{status:404});
  const service=telegramService();
  if (!service) return new Response(null,{status:503});
  const {message}=(await request.json().catch(()=>null)) || {};
  if (message?.chat?.type !== 'private' || !Number.isSafeInteger(message.chat.id) || message.chat.id<=0 || typeof message.text !== 'string') return empty();
  const chat=String(message.chat.id);
  const text=message.text.trim();
  const start=text.match(/^\/start(?:@[A-Za-z0-9_]+)? ([A-Za-z0-9_-]{32})$/);
  const commandMatch=text.match(/^\/(orders|debts)(?:@[A-Za-z0-9_]+)?$/);
  const command=commandMatch?.[1] || 'help';

  let linkedNow=false;
  if (start) {
    const {data,error}=await service.rpc('link_shared_telegram_chat',{p_chat:chat,p_hash:hashCode(start[1])});
    if (error) return new Response(null,{status:503});
    linkedNow=data === true;
    if (!linkedNow) {
      const {data:storeLinked,error:storeError}=await service.rpc('link_store_telegram_chat',{p_chat:chat,p_hash:hashCode(start[1])});
      if (storeError && storeError.code!=='PGRST202') return new Response(null,{status:503});
      linkedNow=storeLinked === true;
    }
  }
  const {data:member,error}=await service.rpc('shared_telegram_bot_data',{p_chat:chat,p_command:command});
  if (error) return new Response(null,{status:503});
  let data=member;
  if (!data) {
    const {data:store,error:storeError}=await service.rpc('store_telegram_bot_data',{p_chat:chat,p_command:command});
    if (storeError && storeError.code!=='PGRST202') return new Response(null,{status:503});
    data=store;
  }
  if (!data && !start && !text.startsWith('/start')) return empty();
  const output=(linkedNow?'BOSHQA hisobi ulandi.\n':'')+answer(command,data);
  const sent=await telegramRequest(token,'sendMessage',{chat_id:chat,text:output.slice(0,3900),link_preview_options:{is_disabled:true}});
  return sent ? empty() : new Response(null,{status:503});
}

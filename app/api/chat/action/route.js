import { makeSupabase } from '../../../../lib/supabase';
import { parseChatAction, resolveChatAction } from '../../../../lib/chat-actions';

export async function POST(request) {
  const authorization = request.headers.get('authorization');
  const body = await request.json().catch(() => null);
  const response = (data, status) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!authorization?.startsWith('Bearer ')) return response({ error: 'Hisobga kiring.' }, 401);
  if (typeof body?.text !== 'string' || body.text.length > 300 ||
    (body.company !== null && (typeof body.company !== 'string' || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(body.company)))) {
    return response({ error: 'Buyruq yaroqsiz.' }, 400);
  }
  const command = parseChatAction(body.text);
  if (!command) return response({ error: 'Buyruq shakli noto‘g‘ri.' }, 400);
  const db = makeSupabase({ auth: { persistSession: false }, global: { headers: { Authorization: authorization } } });
  if (!db) return response({ error: 'Xizmat sozlanmagan.' }, 503);
  const roleResult = body.company ? await db.rpc('company_role', { p_company: body.company }) :
    await db.rpc('is_platform_admin');
  if (roleResult.error) return response({ error: 'Ruxsatni tekshirib bo‘lmadi.' }, 403);
  const role = body.company ? roleResult.data : roleResult.data ? 'admin' : body.store === true ? 'store' : null;
  const action = await resolveChatAction(db, role, body.company, command);
  if (!action) return response({ error: 'Bu amal joriy hisobda yoki buyurtma holatida mavjud emas.' }, 403);
  if (body.confirm !== true) return response({ label: action.label }, 200);
  if (body.label !== action.label) return response({ error: 'Amal o‘zgargan. Qayta tekshiring.' }, 409);
  const { error } = await db.rpc(action.rpc, action.args);
  if (error) return response({ error: error.message }, 409);
  return response({ text: 'Amal bajarildi. · ' + action.label }, 200);
}

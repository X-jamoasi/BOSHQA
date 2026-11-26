import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { makeSupabase, supabaseUrl } from '../../../lib/supabase';
import { accountLogin, loginEmail, loginPattern, sectors } from '../../../lib/accounts';

const staffRoles = ['manager', 'supplier', 'customer'];
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

function failure(error, status) {
  return Response.json({ error }, { status });
}

function validPassword(password) {
  return typeof password === 'string' && [...password].length >= 8 && Buffer.byteLength(password) <= 72;
}

export async function POST(request) {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret || !supabaseUrl) return failure('Hisob yaratish xizmati sozlanmagan.', 503);
  const input = await request.json().catch(() => null);
  if (!input || typeof input !== 'object') return failure('Ma’lumotlar yaroqsiz.', 400);

  const auth = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
  const service = createClient(supabaseUrl, secret, { auth });
  const { action } = input;
  let actor;
  let db;
  if (!['register','register_store'].includes(action)) {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return failure('Hisobga kiring.', 401);
    db = makeSupabase({ auth, global: { headers: { Authorization: authorization } } });
    if (!db) return failure('Hisob xizmati sozlanmagan.', 503);
    const { data, error } = await db.auth.getUser(authorization.slice(7));
    if (error || !data.user) return failure('Hisobga qayta kiring.', 401);
    actor = data.user;
  }

  if (action === 'profile') {
    if (actor.app_metadata.must_change_password === true) return failure('Avval vaqtinchalik parolni almashtiring.', 403);
    const fields = [input.login, input.name, input.email, input.phone];
    if (fields.some(value => typeof value !== 'string')) return failure('Profil ma’lumotlari yaroqsiz.', 400);
    const [login, name, email, phone] = fields.map(value => value.trim());
    const normalizedLogin = login.toLowerCase();
    const currentLogin = accountLogin(actor);
    if (((normalizedLogin || currentLogin) && !loginPattern.test(normalizedLogin)) || name.length > 100 ||
      email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
      (phone && !/^\+[1-9]\d{7,14}$/.test(phone))) {
      return failure('Login, ism, e-pochta yoki telefon formatini tekshiring. Telefonni +998901234567 kabi kiriting.', 400);
    }

    const loginChanged = Boolean(normalizedLogin && normalizedLogin !== currentLogin);
    const update = { user_metadata: { full_name: name, profile_email: email, profile_phone: phone } };
    if (loginChanged) {
      if (typeof input.currentPassword !== 'string' || !input.currentPassword || input.currentPassword.length > 256) {
        return failure('Loginni o‘zgartirish uchun amaldagi parolni kiriting.', 400);
      }
      const verifier = makeSupabase({ auth });
      const { error: verifyError } = await verifier.auth.signInWithPassword({ email: actor.email, password: input.currentPassword });
      if (verifyError) return failure('Amaldagi parolni tasdiqlab bo‘lmadi.', 401);
      update.email = loginEmail(normalizedLogin);
      update.email_confirm = true;
      update.app_metadata = { login: normalizedLogin };
    }

    const { error } = await service.auth.admin.updateUserById(actor.id, update);
    if (['email_exists', 'user_already_exists', 'identity_already_exists'].includes(error?.code)) return failure('Bu login band.', 409);
    if (error) return failure('Profilni saqlab bo‘lmadi.', 502);
    return Response.json({ ok: true, loginChanged }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (action === 'password') {
    if (actor.app_metadata.must_change_password !== true) return failure('Parolni majburiy almashtirish talab qilinmaydi.', 409);
    if (!validPassword(input.password)) return failure('Yangi parol kamida 8 belgidan va ko‘pi bilan 72 baytdan iborat bo‘lsin.', 400);
    if (typeof input.currentPassword !== 'string' || input.currentPassword === input.password) {
      return failure('Vaqtinchalik paroldan farqli yangi parol tanlang.', 400);
    }
    const verifier = makeSupabase({ auth });
    const { error: verifyError } = await verifier.auth.signInWithPassword({ email: actor.email, password: input.currentPassword });
    if (verifyError) return failure('Vaqtinchalik parol noto‘g‘ri.', 401);
    const { error } = await service.auth.admin.updateUserById(actor.id, {
      password: input.password, app_metadata: { must_change_password: false },
    });
    if (error) return failure('Parolni yangilab bo‘lmadi.', 502);
    return Response.json({ ok: true });
  }

  if (!['register', 'register_store', 'staff'].includes(action)) return failure('Amal yaroqsiz.', 400);
  const login = typeof input.login === 'string' ? input.login.trim().toLowerCase() : '';
  if (!loginPattern.test(login)) return failure('Login 3–32 ta lotin harfi, raqam, nuqta, chiziq yoki pastki chiziqdan iborat bo‘lsin.', 400);

  let metadata;
  let password;
  let staffProfile;
  if (action === 'register') {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const contact = typeof input.contact === 'string' ? input.contact.trim() : '';
    if (name.length < 2 || name.length > 100 || !sectors.includes(input.sector) ||
      contact.length > 254 || !(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) || /^\+[1-9]\d{7,14}$/.test(contact)) || !validPassword(input.password)) {
      return failure('Korxona nomi, yo‘nalish, aloqa ma’lumoti va parolni tekshiring.', 400);
    }
    metadata = { boshqa_kind: 'company', company_name: name, sector: input.sector, contact };
    password = input.password;
  } else if (action === 'register_store') {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (name.length < 2 || name.length > 100 || !validPassword(input.password)) {
      return failure('Do‘kon nomi va kamida 8 belgili parolni kiriting.',400);
    }
    metadata = { boshqa_kind:'store',store_name:name };
    password = input.password;
  } else {
    if (typeof input.company !== 'string' || !uuid.test(input.company) || !staffRoles.includes(input.role)) {
      return failure('Korxona yoki rol yaroqsiz.', 400);
    }
    const { data: role, error } = await db.rpc('company_role', { p_company: input.company });
    if (error || role !== 'owner') return failure('Xodimni faqat korxona egasi qo‘sha oladi.', 403);
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
    if (name.length > 100 || (phone && !/^\+[1-9]\d{7,14}$/.test(phone))) {
      return failure('Ism yoki telefon formatini tekshiring. Telefonni +998901234567 kabi kiriting.', 400);
    }
    staffProfile = { ...(name ? { full_name: name } : {}), ...(phone ? { profile_phone: phone } : {}) };
    metadata = { boshqa_kind: 'staff', company_id: input.company, created_by: actor.id, role: input.role, must_change_password: true };
    password = randomBytes(18).toString('base64url') + 'aA7!';
  }

  const email = loginEmail(login);
  async function finalizeStaff(userId) {
    const { data: staffId, error } = await service.rpc('finalize_staff_membership', {
      p_company: input.company, p_actor: actor.id, p_role: input.role, p_email: email, p_user: userId,
    });
    if (error) console.warn('Staff membership could not be finalized', error.code);
    return { staffId, error };
  }

  const staffResponse = (recovered) => Response.json({ login, password, recovered }, {
    status: recovered ? 200 : 201, headers: { 'Cache-Control': 'no-store' },
  });
  const membershipFailure = () => failure('Xodimni biriktirish xizmati ishlamadi. Supabase xodimlar migratsiyasini tekshiring.', 502);

  if (action === 'staff') {
    const { staffId, error } = await finalizeStaff(null);
    if (error) return membershipFailure();
    if (staffId) {
      const { error: resetError } = await service.auth.admin.updateUserById(staffId, { password, user_metadata: staffProfile });
      if (resetError) {
        console.warn('Recovered staff password could not be set', resetError.code);
        return failure('Xodim korxonaga biriktirildi, lekin vaqtinchalik parolni yaratib bo‘lmadi. Platforma egasiga murojaat qiling.', 502);
      }
      return staffResponse(true);
    }
  }

  const { data, error } = await service.auth.admin.createUser({
    email, password, email_confirm: true, app_metadata: { ...metadata, login }, user_metadata: staffProfile,
  });
  const exists = ['email_exists', 'user_already_exists', 'identity_already_exists'].includes(error?.code);
  if (action === 'staff' && !error) {
    const { staffId, error: membershipError } = await finalizeStaff(data.user.id);
    if (membershipError) return membershipFailure();
    if (!staffId) return failure('Hisob yaratildi, lekin korxonaga biriktirib bo‘lmadi. Shu login va rol bilan qayta urinib ko‘ring.', 502);
    return staffResponse(false);
  }

  if (exists) return failure('Bu login band.', 409);
  if (error) return failure('Hisob yaratilmadi. Korxona sozlamalari va migratsiyani tekshiring.', 502);
  return Response.json({ ok: true }, {
    status: 201, headers: { 'Cache-Control': 'no-store' },
  });
}

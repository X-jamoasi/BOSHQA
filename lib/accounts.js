export const loginPattern = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const sectors = ['Oziq-ovqat', 'Qurilish mollari', 'To‘qimachilik', 'Metall va uskunalar', 'Qishloq xo‘jaligi', 'Boshqa'];

export function loginEmail(login) {
  return login + '@login.boshqa-iota.vercel.app';
}

export function accountLogin(user) {
  const suffix = loginEmail('');
  return user.app_metadata?.login ||
    (user.email?.endsWith(suffix) ? user.email.slice(0, -suffix.length) : '');
}

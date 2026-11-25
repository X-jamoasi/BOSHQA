export const loginPattern = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const sectors = ['Oziq-ovqat', 'Qurilish mollari', 'To‘qimachilik', 'Metall va uskunalar', 'Qishloq xo‘jaligi', 'Boshqa'];

export function loginEmail(login) {
  return login + '@login.boshqa-iota.vercel.app';
}

export function findChatHelp(question, role) {
  const text = question.normalize('NFKC').toLowerCase().replace(/[‘’ʻʼ`']/g, '');
  const manages = role === 'owner' || role === 'manager';

  if (role === 'admin') {
    if (/ai|xulosa|monitoring|tahlil/.test(text)) return 'Chap menyudan AI monitoring bo‘limini oching. U yerda oldingi so‘rovlar natijasi, ishlatilgan model va xato sababi ko‘rinadi.';
    if (/korxona|buyurtma/.test(text)) return 'Korxonalar bo‘limida korxonalarni nom va yo‘nalish bo‘yicha topasiz. Bosh sahifada platforma bo‘yicha buyurtmalar soni ko‘rinadi.';
    if (/daromad|obuna|tolov/.test(text)) return 'Daromad bo‘limida to‘lov tizimi holati ko‘rsatiladi. To‘lov tizimi ulangach, faol obunalar va daromad shu yerda ko‘rinadi.';
    if (/jurnal|faoliyat|huquq/.test(text)) return 'Faoliyat jurnali bo‘limida yangi korxonalar va super admin huquqidagi o‘zgarishlar ko‘rinadi.';
    return null;
  }

  if (/buyurtma|yetkaz|jonat/.test(text)) {
    if (role === 'supplier') return 'Buyurtmalar → Buyurtmalar ro‘yxatini oching. Tasdiqlangan buyurtma uchun Jo‘natish tugmasini bosing. Tayyor mahsulot mijozga yetib borgach, Mijozga topshirildi tugmasini bosing.';
    if (role === 'customer') return 'Buyurtmalar bo‘limidagi ro‘yxatdan o‘z buyurtmangizning Holat ustuniga qarang. Buyurtma topshirilganda holati Topshirilgan bo‘ladi.';
    if (manages) return 'Buyurtmalar → Buyurtmalar ro‘yxatidagi Holat ustuniga qarang. Chiqimni tasdiqlashda yetkazuvchini tanlang. Xomashyo kelganda Omborga qabul qilish tugmasidan foydalaning.';
  }
  if (role === 'owner' && /xodim|ishchi|hamkor/.test(text)) return 'Xodimlar → Xodim yoki hamkor hisobi bo‘limini oching. Login va rolni tanlab Hisob yaratish tugmasini bosing. Xodim birinchi kirishda vaqtinchalik parolni almashtiradi.';
  if (manages && /ai|xulosa|tavsiya|tahlil/.test(text)) return 'AI tahlili bo‘limida AI xulosasini olish tugmasini bosing. Tahlil uchun omborda kamida bitta mahsulot bo‘lishi kerak.';
  if (manages && /mahsulot|ombor|qoldiq/.test(text)) return 'Mahsulotlar bo‘limida ombordagi qoldiqlarni ko‘rasiz. Mahsulot qo‘shish qismiga nom, boshlang‘ich qoldiq va minimal qoldiqni kiriting, keyin Saqlashni bosing.';
  return null;
}

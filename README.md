# BOSHQA

BOSHQA — ishlab chiqarish korxonalari uchun ombor, xomashyo ta’minoti va mijozlarga yetkazishni boshqarish platformasi.

## Mahalliy ishga tushirish

1. Supabase’da loyiha yarating. SQL Editor orqali [boshlang‘ich migratsiyani](supabase/migrations/202611250001_boshqa.sql) yangi bazaga bir marta qo‘llang. Keyin [hisoblar migratsiyasini](supabase/migrations/202611250002_accounts.sql) bir marta qo‘llang. Mavjud bazada birinchi migratsiya bajarilgan bo‘lsa, ikkinchisini qo‘llash kifoya.
2. `.env.example` asosida `.env.local` yarating. `NEXT_PUBLIC_SUPABASE_URL` uchun loyiha URL manzilini, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` uchun ommaviy kalitni kiriting.
3. Supabase Authentication sozlamalarida Email orqali kirishni yoqing. Qaytish manzillari ro‘yxatiga `http://localhost:3000` va ilovaning Vercel manzilini qo‘shing. Haqiqiy foydalanuvchilar tasdiqlash xatlarini olishlari uchun SMTP sozlang.
4. `npm ci` va `npm run dev` buyruqlarini bajaring. Brauzerda `http://localhost:3000` manzilini oching.

## Rollar va ombor harakati

- **Korxona egasi** korxona ochadi, xodimlar va hamkorlar uchun login va vaqtinchalik parol yaratadi va ombor hamda buyurtmalarni boshqaradi.
- **Menejer** mahsulot qo‘shadi, xomashyo buyurtmasi beradi, buyurtmalarni tasdiqlaydi va kelgan xomashyoni omborga qabul qiladi.
- **Ta’minotchi va yetkazuvchi** o‘ziga biriktirilgan buyurtmalarni ko‘radi, ikkala yo‘nalishda jo‘natadi va tayyor mahsulot mijozga topshirilganini belgilaydi.
- **Buyurtmachi** katalogdan mahsulot tanlaydi, manzilni kiritadi va o‘z buyurtmalarini kuzatadi.
- **Platforma egasi** korxonalar ro‘yxatini, a’zolar va buyurtmalar sonini ko‘radi. Birinchi administrator uchun Supabase SQL Editor orqali `public.platform_admins` jadvaliga aniq tasdiqlangan foydalanuvchi UUID’sini kiriting.

Tayyor mahsulot buyurtmasi tasdiqlanganda qoldiq kamayadi. Kelgan xomashyoni menejer yoki korxona egasi qabul qilganda qoldiq ortadi. Har ikki o‘zgarish buyurtma holati bilan bitta tranzaksiyada yoziladi.

## Vercel va Gemini

Vercel’da GitHub repozitoriyini Next.js loyihasi sifatida import qiling. Ikki ommaviy Supabase o‘zgaruvchisi bilan birga server uchun `SUPABASE_SECRET_KEY` ni qo‘shing. Gemini kerak bo‘lsa, `GEMINI_API_KEY` qiymatini faqat server muhitida saqlang. API seans va korxona rolini tekshiradi, mahsulot nomi va qoldiq sonlarini bazadan oladi va har bir foydalanuvchiga daqiqasiga bitta Gemini so‘rovini ruxsat qiladi. Kalitsiz ilova minimal qoldiq bo‘yicha avtomatik tekshiruvni ishlatadi.
BOSHQA xomashyo kirimi va tayyor mahsulot yetkazilishini boshqaradi.

Yangi korxona egasi login bilan kiradi. Avvalgi hisoblar uchun e-pochta orqali kirish saqlangan. Xodim birinchi kirishda vaqtinchalik parolni o‘zgartiradi. Korxona egasi uni xodimga xavfsiz kanal orqali bir marta yuboradi.
Korxona egasi xodim uchun login va vaqtinchalik parol yaratishi mumkin.
Super admin platforma ko‘rsatkichlarini, korxona egasi esa o‘z ombori va xodimlarini boshqaradi.
BOSHQA panelida mahsulotlar, xodimlar va buyurtmalar alohida bo‘limlarda.
Korxona ma’lumotlari alohida bo‘limda ko‘rsatiladi.

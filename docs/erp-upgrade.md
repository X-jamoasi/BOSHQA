# BOSHQA ERP auditi

Kod bazasi `79d2a7e` holatida tekshirildi. Development tarmog‘i production tarixidan ajratildi.

| Yo‘nalish | Mavjud holat |
| --- | --- |
| Panellar | Super admin, ega, menejer, yetkazuvchi, agent va do‘kon. Next.js sahifasida rollar bo‘yicha navigatsiya va Supabase sessiyasi ishlatiladi. |
| Ombor | `products.stock` korxona bo‘yicha umumiy qoldiq. Chiqim buyurtmani tasdiqlaganda, kirim yetkazilgan xomashyoni qabul qilganda yoziladi. Mahsulot tahririda ham qoldiq o‘zgarishi mumkin. `stock_movements` faqat buyurtma harakatlarini qamraydi. |
| Savdo va moliya | Savat raqami umumiy. Narxlar buyurtmada saqlanadi. To‘lovlar mahsulot yozuvlariga ajratilib, guruh sifatida tasdiqlanadi. Xaridlar uchun alohida kreditor hisobi va tannarx yo‘q. |
| Inventarizatsiya | Ombor ro‘yxati va qo‘lda qoldiq tahriri mavjud. Sanash, tafovut va egasi tasdig‘i uchun alohida hujjat mavjud emas. |
| Hujjatlar | Nakladnoy tasdiqda JSON snapshot sifatida olinadi va PDF brauzerda yaratiladi. Zaxira eksporti CSV, JSON va PDF beradi. |
| AI | Gemini server orqali ishlaydi. Ombor tavsiyasi yetti to‘liq kun bo‘yicha chiqimga tayanadi. Do‘konning kassadagi haqiqiy sotuvlari va ichki qoldig‘i mavjud emas. |
| Ruxsatlar | Korxona a’zoligi va rol RPC orqali tekshiriladi. Do‘konlar o‘z bog‘langan firmalariga va buyurtmalariga kiradi. |
| Takrorlanish | Buyurtmani guruhlash umumiy yordamchida. Katalog, moliya, hujjatlar va AI qoldiqni alohida so‘raydi. Ombor uchun yagona yozish manbasi kerak. |

## Bog‘liqliklar

Avval mavjud umumiy qoldiq bilan mos ishlaydigan tranzaksion kirim, chiqim va inventarizatsiya. Filial alohida qoldiq yurita boshlashidan oldin eski buyurtma, qo‘lda tahrir va zaxiralash ham shu hisobga ulanishi kerak. Aks holda parallel ikkita qoldiq paydo bo‘ladi. Do‘kon prognozi uchun sotuv va mahalliy qoldiq manbasi kerak. Ombordagi ma’lumot bilan do‘kon kassa talabini almashtirish mumkin emas.

## Tashqi hujjatlar

Didox uchun rasmiy API shartnomasi, test muhiti, korxona autentifikatsiyasi, hujjat turlari va holatlar xaritasi kerak. E-IMZO uchun rasmiy SDK yoki xizmat, sertifikatni tekshirish, imzolash va bekor qilish tartibi hamda test sertifikati kerak. BOSHQA ichki hujjatlarining huquqiy holati alohida ko‘rsatiladi. Imzolangan holat faqat tashqi tizim tasdiqlaganidan keyin yozilishi kerak.

## NFC roadmap

1. Qurilma turi va xodimning ongli ishtiroki asosida kichik pilot.
2. Kelish va ketish hodisalari, takroriy o‘qishlarni ajratish va offline sinxronlash.
3. Smena va davomatni tekshirish, xodimning xatoni tuzatish so‘rovi.
4. Ish vaqti va vazifalar hisobotlari. Saqlash muddati, kirish ruxsatlari va auditni oldindan belgilash.
5. Ishlab chiqarish natijalarini faqat aniq va tekshiriladigan manba bo‘lsa ulash.

## Preview va release

Preview uchun alohida Supabase loyiha ishlatiladi. Mavjud migratsiyalardan keyin yangi migratsiya qo‘llanadi va rol sinovlari bajariladi. Production uchun egasining ruxsati, baza zaxirasi va tiklash sinovi kerak. Ilovani oldingi commitga qaytarish mumkin. Yozilgan ombor harakatlarini rollback paytida o‘chirish o‘rniga nazoratli kompensatsiya yoki zaxiradan tiklash qarori kerak.

## Development tarmog‘idagi natija

- 014 migratsiya korxona egasi va menejer uchun qoralama, ko‘p mahsulotli kirim va chiqim, inventarizatsiya, tasdiqlash va tarixni qo‘shadi. Inventarizatsiya qoldig‘i qoralama tuzilganidan keyin o‘zgarsa, tasdiq rad etiladi. Tannarx ma’lum bo‘lsa, kirim miqdor bo‘yicha o‘rtachani yangilaydi. Eski qoldiq qiymati noma’lum bo‘lsa, natija ham noma’lum qoladi.
- 015 migratsiya korxona uchun 28 kunlik real yetkazish tarixidan 7, 14, 30 va 90 kunlik oddiy prognoz va minimal qoldiq asosidagi zaxira ehtiyojini chiqaradi. Ishonchlilik belgilari kuzatilgan kunlar soniga asoslangan, statistik ehtimollik sifatida ishlatilmaydi.
- Pul majburiyatlari, ta’minotchi va xarid hujjatlari, omborlararo ko‘chirish, hujjatlarga versiya berish, haqiqiy do‘kon sotuvlari, prognozga Gemini izohi va xarid qoralamasi keyingi ish. FIFO, to‘liq tannarx tarkibi va tarixiy sotuv tannarxini alohida hisoblash ham hali qo‘shilmagan.
- PGlite’da mavjud regression zanjiri, yangi kirim, qayta yuborish, o‘rtacha tannarx, inventarizatsiya tasdig‘i va tashkilotlararo ajratish tekshirildi. Parallel sessiyalar, katta hajm va tashqi xizmatlar Preview bazasida sinovdan o‘tishi kerak.

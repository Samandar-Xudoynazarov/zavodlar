# Dizayn yangilanishi — 2026-10-12

Mavjud zavodlar-app interfeysi yangilandi. Koddagi API, hisob-kitoblar va foydalanuvchi huquqlari saqlandi.

1. Umumiy panel — tekshiruvdan o‘tdi. Menyu 6 guruhga ajratildi, nom bo‘yicha qidiruv va yig‘ish/ochish bor. Kunlik reja, fakt, jo‘natish va e’tibor talab qiladigan zavodlar alohida ko‘rsatiladi. 1440 piksel desktopda 4 zavod kartasi bitta qatorda.
2. Kunlik hisobot, desktop — tekshiruvdan o‘tdi. Saqlash paneli, saqlangan/saqlanmagan holat, KPI va bosqich sarlavhalari qo‘shildi. Excel, ulashish va chop etish Eksport menyusiga yig‘ildi. Sinov hisobotida Fakt 24 → 25 o‘zgartirilib saqlandi; Excel fayli yuklab olindi. Eksport ArrowDown va Escape bilan boshqarildi.
3. Kunlik hisobot, telefon — tekshiruvdan o‘tdi. Reja/fakt/brak yonma-yon maydonlar, ixcham jami va doim ko‘rinadigan saqlash paneli. Uzun buyurtma nomining sahifani kengaytirishi tuzatildi. 320 va 390 piksel viewportlarda hujjat kengligi ekran kengligidan oshmadi.
4. Rollar va tarjima — tekshiruvdan o‘tdi. Kuzatuvchida Saqlash/Kirim tugmalari yo‘q; ustada Saqlash bor, Kirim va kunni o‘chirish yo‘q. Ruscha yangi menyu/holat matnlari tekshirildi, kirillcha o‘zbekcha mavjud avtomatik o‘girishdan foydalanadi.
5. Ombor va Buyurtmalar — ochilib tekshirildi. Umumiy yangi matn, karta, maydon va eksport uslublari qo‘llanmoqda.

Yakuniy npm run build va JSX/CSS sintaksisi tekshiruvlari o‘tdi. Brauzer konsolida xatolar qayd etilmadi.

Tekshiruv alohida vaqtinchalik PostgreSQL sxemasidagi sinov ma’lumotlari bilan bajarildi. Amaldagi ish bazasi o‘zgartirilmadi. Tungi ranglar va asosiy matn kontrastlari CSS orqali tekshirildi; bu to‘liq accessibility audit emas. Serverga joylash bu ishga kirmaydi.

![Umumiy panel](C:/Users/SAMANDAR/Desktop/zavodlar-app/design-review/after/01-overview.png)

![Kunlik hisobot desktop](C:/Users/SAMANDAR/Desktop/zavodlar-app/design-review/after/02-daily-desktop.png)

![Kunlik hisobot telefon](C:/Users/SAMANDAR/Desktop/zavodlar-app/design-review/after/03-daily-mobile.png)

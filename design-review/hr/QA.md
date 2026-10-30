# Kadrlar va oylik: tekshiruv

2026-10-29. Barcha tekshiruvlar vaqtinchalik PostgreSQL sxemalari va sun’iy xodimlarda bajarildi. Brauzerdagi barcha API so‘rovlari mahalliy sinov serveriga yo‘naltirildi; frontend sozlamasidagi ish serveriga yuborilmadi.

- Backend regressiya, bildirishnomalar va Telegram testlari o‘tdi.
- Moliyaviy hisob: soatga mutanosib haq, koeffitsiyent, oy o‘rtasida maosh almashishi va ikki xonali yaxlitlash tekshirildi.
- Huquqlar: kadrlar va ustaga moliyaviy maydonlar berilmasligi, boshqa rollarning bo‘limga kira olmasligi, zavodlar orasidagi chegara tekshirildi.
- Parallel tabel saqlashda bitta yozuv qabul qilindi, ikkinchisi 409 bilan rad etildi.
- Bir xil kalitli parallel to‘lov bir marta yozildi; kalit boshqa qiymatga qayta ishlatilsa rad etildi.
- Maoshni qoralama davrda tuzatish, eski versiya bilan yozishni rad etish va tasdiqlangan davrni himoyalash tekshirildi.
- To‘lovni sabab bilan bekor qilish, tasdiqlash, oy yopish va qoldiqni keyingi oyga ko‘chirish tekshirildi.
- To‘liq zaxira tiklandi; eski formatdagi, kadrlar jadvallarisiz zaxira mavjud kadrlar ma’lumotlarini saqlab qoldi.
- Brauzerda yangi xodim yaratish, maoshni tahrirlash, tabel saqlash, qo‘shimcha haq, karta to‘lovi, tasdiqlash va yopish bajarildi.
- O‘zbek lotin, o‘zbek kirill va rus interfeyslari tekshirildi. Excel yuklanib, ikkita varag‘i qayta ochib tekshirildi. Hisob varaqasining chop etish chiqishi yaratildi.
- Kadrlar, usta va buxgalter uchun 390 va 320 piksel ekranlarda sahifa kengligi tekshirildi. Oylik jadvali kichik ekranda kartochkaga aylanadi.
- Brauzer sahifasida bajarilish xatolari qayd etilmadi. `npm run build` o‘tdi.

Rasmlar sinov ma’lumotlarini ko‘rsatadi. Bu hisoblash qoidalarining qonunchilikka muvofiqligi bo‘yicha audit emas: maxsus to‘lovlar, soliq va oy normasi buxgalter tomonidan tekshiriladi. Serverga joylash bajarilmadi.

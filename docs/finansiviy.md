# Finansiviy bo‘limi

Huquqlar: admin, rahbar va buxgalter. API ham shu rollarni tekshiradi. Har bir yozuv tanlangan zavodga tegishli; zavod xodimi boshqa zavodga o‘ta olmaydi.

## Oylik vedomosti

Barcha xodimlar bitta jadvalda: ish soati, oldingi qoldiq, vaqtbay ish haqi, koeffitsiyent, qo‘shimcha, xizmat safari, soliq, ushlanmalar, sof maosh, naqd, karta, jami to‘langan va qoldiq. Oy, bo‘lim, F.I.Sh. yoki tabel raqami bilan filtrlash va Excel yuklash mavjud. Xodim qatoridagi To‘lov tugmasi mavjud oylik to‘lov tizimiga yozadi. Hisoblash va oy boshqaruvi orqali hisob oyini ochish, qo‘shimchalar, tasdiqlash, to‘lovlarni bekor qilish va oy yopish ochiladi.

Qoldiq = oldingi qoldiq + sof maosh − naqd − karta. Manfiy qoldiq — ortiqcha to‘langan avans. Hisoblash qoidalari avvalgi payroll modulidan olinadi; qayta, mustaqil hisob yuritilmaydi. Yopilgan oyni o‘zgartirish mumkin emas.

Material hisoboti endi Finansiviy menyusida. Hisobotning mavjud DOCX eksporti saqlangan.

## Buyurtmalar moliyasi

- Shartnoma summasi: buyurtmadagi miqdor × dona narxi. Buyurtma narxi nol bo‘lsa, mavjud kalkulyatsiya narxi qo‘llanadi.
- Jo‘natilgan summa: buyurtmaga bog‘langan jo‘natishlar, tizimdan oldingi son bilan birga × dona narxi.
- Faktura summasi: bekor qilinmagan fakturalardagi jami. Faktura narxi va summasi yuklangan hujjatga qarab kiritiladi va tarixiy qiymat sifatida saqlanadi.
- Kelib tushgan: bekor qilinmagan avans va to‘lovlar.
- Realizatsiya qoldig‘i = jo‘natilgan summa − tushum.
- Shartnoma qoldig‘i = shartnoma summasi − tushum.
- Faktura − tushum ko‘rsatkichi alohida beriladi. Har bir faktura qatorida faqat o‘sha fakturaga bog‘langan to‘lov va qoldiq ko‘rinadi. Umumiy avans o‘z-o‘zidan fakturalarga taqsimlanmaydi.

Tayyor soni shu buyurtma uchun ajratilgan jami mahsulotdir (jo‘natilganlari bilan). Uni Tayyor sonini kiritish oynasida belgilang. Umumiy ombor avtomatik ravishda turli buyurtmalarga ajratilmaydi. Tayyor soni kamida jo‘natilgan son bo‘ladi. Tayyor qoldiq = tayyor − jo‘natilgan; buyurtma qoldig‘i = buyurtma − jo‘natilgan.

Faktura PDF (8 MB gacha) yuklanayotganda raqam, sana, mahsulotlar soni va narxi kiritiladi. PDF avtomatik o‘qilmaydi: hujjatdagi jami bilan jadvaldagi jami mosligini tekshiring. Faktura soni hali faktura qilinmagan jo‘natilgan sondan oshmaydi. PDFni ochish yoki yuklab olish mumkin.

To‘lov buyurtma bo‘yicha yoziladi; istalsa shu buyurtmadagi fakturaga bog‘lanadi. Xato yozuvlar sabab bilan bekor qilinadi va tarixda saqlanadi. To‘lov bog‘langan fakturani bekor qilishdan oldin uning to‘lovlari bekor qilinadi. Faktura/to‘lov tarixi bor buyurtmani o‘chirib bo‘lmaydi. Faktura qilingan jo‘natishni kamaytirish yoki kunni o‘chirish ham bloklanadi.

## Mahsulotning jo‘natish tarixi

Buyurtmalar kartasidagi yoki Finansiviydagi mahsulot nomini bosing: sana, miqdor, qayerga, mashina va накладная raqami ochiladi. Raqamdan asl saqlangan PDF ochiladi.

Yangi накладная kunlik hisobotda tayyorlanib jo‘natishga yozilganda PDF ham shu saqlash tranzaksiyasida arxivlanadi. Saqlash xatosi bo‘lsa PDF arxivi va kunlik yozuv birgalikda bekor bo‘ladi. Saqlangan jo‘natish tafsiloti qo‘lda o‘zgartirilsa, eski PDF bilan bog‘lanish uziladi; yangi накладная yarating.

Avval serverda saqlanmagan PDFlar qayta tiklanmaydi: eski jo‘natishda PDF saqlanmagan deb ko‘rsatiladi. Tizimdan oldingi jo‘natishlar uchun miqdor alohida chiqadi, tafsilotlar mavjud bo‘lmasa taxmin qilinmaydi.

## Baza va zaxira

009_finance_dispatch.sql migratsiyasi backend ishga tushganda avtomatik qo‘llanadi. PDFlar va moliyaviy yozuvlar zaxira nusxaga kiradi. Moliyaviy ma’lumotlari bor zavodga eski, moliyaviy jadvallarsiz zaxira tiklash bloklanadi, shunda yangi faktura va tushumlar yo‘qolmaydi.

Tekshirish: npm test; alohida npm run test:finance. Brauzer testi: node --env-file-if-exists=.env tests/finance-browser.js (Chrome, Playwright va frontend production build kerak). Testlar alohida vaqtinchalik schema ichida ishlaydi.

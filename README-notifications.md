# Kunlik reja xabarnomalari

Kunlik hisobotda mahsulotlar bo'yicha **reja** birinchi marta qo'yilganda, reja o'zgartirilganda yoki tozalanganda **kuzatuvchi** rolidagi faol foydalanuvchilarga xabar yaratiladi. Zavodga biriktirilgan kuzatuvchi faqat shu zavodning xabarlarini oladi; bosh ofis kuzatuvchisi barcha faol zavodlarni ko'radi. Reja o'zgarmasdan fakt/sarf/izoh saqlansa, takroriy xabar yaratilmaydi.

Ilovadagi qo'ng'iroq orqali xabarlar ko'riladi. Ochiq sahifada xabarlar har 2 soniyada yangilanadi; fon sahifasida har 15 soniyada, sahifaga qaytilganda esa darhol tekshiriladi. Telegramdan foydalanish har bir kuzatuvchining o'z hisobini botga ulashiga bog'liq. Telegram yuborish ishlamasa ham kunlik hisobot va ilovadagi xabar bazada saqlanadi.

## Administrator: Telegramni sozlash

Bot tayyor bo'lsa, BotFather'dagi tokenni **faqat backend** muhitiga kiriting. Tokenni chatga, GitHub'ga, frontendga yoki NEXT_PUBLIC_* o'zgaruvchiga qo'ymang.

Backend .env uchun o'zgaruvchilar:

~~~dotenv
TELEGRAM_BOT_TOKEN=<BotFather bergan token>
TELEGRAM_BOT_USERNAME=<bot_username>
TELEGRAM_WEBHOOK_SECRET=<boshqa tasodifiy maxfiy kalit>
TELEGRAM_WEBHOOK_URL=https://BACKEND_DOMEN/api/telegram/webhook
APP_PUBLIC_URL=https://FRONTEND_DOMEN
~~~

- TELEGRAM_BOT_USERNAME: @ belgisiz. Bo'sh qoldirilsa botning getMe javobidan olinadi.
- TELEGRAM_WEBHOOK_SECRET: bot tokenidan boshqa kalit; 16–256 ta lotin harfi, raqam, _ yoki -. Masalan, lokal terminalda quyidagi buyruq bilan yaratiladi.
- TELEGRAM_WEBHOOK_URL: ommaviy, HTTPS backend manzili; oxiri /api/telegram/webhook.
- APP_PUBLIC_URL: kuzatuvchi kiradigan frontendning manzili. Xabardagi havola tegishli zavod va sanani ochadi.

~~~powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
~~~

Vercel'da shu qiymatlarni **backend loyihasi → Settings → Environment Variables → Production** bo'limiga kiriting va backendni redeploy qiling. Faqat frontendga token qo'yish yetarli emas. Backenddagi DATABASE_URL va AUTH_SECRET ham sozlangan bo'lishi kerak. Maxfiy qiymatlarni qayta yuborish yoki skrinshot bilan ko'rsatish kerak emas.

Backend ommaviy ishlayotgani tekshirilgach, o'zgaruvchilar kiritilgan lokal backend/.env bilan quyidagini bajaring:

~~~powershell
cd C:\Users\SAMANDAR\Desktop\zavodlar-app\backend
npm run telegram:setup
~~~

Bu buyruq botning webhook manzilini o'rnatadi. Avvalgi webhook o'rniga shu loyiha ulanadi. Kutayotgan update'lar o'chirilmaydi. Bot boshqa xizmatga ulangan bo'lsa, shu loyiha uchun alohida bot ishlating. Skript token va maxfiy webhook kalitini chiqarmaydi.

Setup buyruq avtomatik bajarilmaydi: haqiqiy bot tokeni va ommaviy backend tayyor bo'lganda administrator uni bir marta ishga tushiradi. Ommaviy webhook manzili yoki kalit o'zgarganda qayta bajaring.

Lokal http://localhost:4000 manziliga Telegram tashqaridan kira olmaydi. Lokal sinov uchun HTTPS tunnelning /api/telegram/webhook manzilini sozlash yoki test backenddan foydalanish kerak.

## Kuzatuvchi: o'z Telegramini ulash

1. Ilovaga kuzatuvchi hisobi bilan kiring.
2. Qo'ng'iroq / Xabarnomalar oynasida **Telegramni ulash**ni bosing.
3. Ochilgan shaxsiy bot chatida **Start**ni bosing.
4. Ilovada **Telegram ulangan** holati ko'rinadi.

Ulash havolasi 10 daqiqa amal qiladi va bir marta ishlatiladi. Havolani boshqa odamga yubormang: u sizning hisobingizni ulash uchun berilgan. Muddati o'tsa yangi havola yarating. Telegram guruhlari, kanallar, boshqa botlar, faol bo'lmagan yoki kuzatuvchi bo'lmagan hisoblar ulanmaydi. Bitta Telegram chat boshqa ilova foydalanuvchisiga bir vaqtda ulana olmaydi.

**Telegramni uzish** faqat foydalanuvchining o'z ulanishi va kutayotgan ulash havolasini bekor qiladi. Bot bloklansa yuborishdagi 403 javobi ulanishni uzadi; botni ochib yangi havola bilan qayta ulang.

Ulangan paytdan oldingi xabarlar Telegramga yuborilmaydi. Ilovadagi avvalgi xabarlar ilovada qoladi.

## Xabarning mazmuni

~~~text
Kunlik reja qo'yildi
Zavod: 1-zavod
Sana: 12.10.2026
Mas'ul: Usta
Jami reja: 125 dona

• PB-01: 75 dona
• PB-02: 50 dona

Hisobotni ochish: https://FRONTEND_DOMEN/?factory=...&day=2026-10-12
~~~

Reja yangilanganda yoki tozalanganda sarlavha tegishlicha o'zgaradi. Telegram xabarida dastlabki 20 ta mahsulot va jami ko'rsatiladi; to'liq reja havola orqali ochiladi.

## Qayta yuborish va tekshirish

Yuborish holati notification_recipients jadvalida saqlanadi: telegram_sent_at, telegram_attempts, telegram_error, telegram_next_attempt_at.

Yangi reja bazaga yozilgandan so'ng barcha hozir yuborish mumkin bo'lgan kuzatuvchilarga darhol yuborishga urinish bo'ladi. Birinchi 10 tadan keyin navbatdagi paketlar ham shu saqlash so'rovida yuboriladi; buning uchun ilova ochiq turishi shart emas. Yangi paketlarni boshlash uchun 20 soniyalik vaqt ajratiladi. Juda katta navbat yoki sekin Telegram javoblari bu vaqtdan oshsa, qolgan xabarlar bazada navbatda qolib, keyingi qayta urinishda yuboriladi. Vaqtinchalik tarmoq yoki Telegram cheklovi uchun kutish 30 soniyadan boshlanib ortadi. Telegram bergan retry_after vaqti hisobga olinadi. Har urinish 5 soniyagacha kutadi, bitta paketda 10 tagacha qabul qiluvchi parallel ishlanadi. Faol rol va hozirgi zavod huquqi har yuborishda qayta tekshiriladi.

Lokal Node.js serveri 30 soniyada navbatni tekshiradi. Ilovadagi kuzatuvchi xabarlarni so'raganda ham navbatdagi urinishlar davom etadi. Vercel serverless holatida so'rovsiz fon jarayoni doimiy ishlamaydi: ilovadagi polling / keyingi so'rovlar navbatni davom ettiradi; so'rovsiz ham kafolatlangan qayta urinish kerak bo'lsa alohida scheduler/worker sozlang. Haqiqiy scheduler bu o'zgarish bilan ro'yxatga olinmaydi.

Telegramning 400/401/403 javoblarida yoki 10 ta muvaffaqiyatsiz urinishdan keyin shu yetkazish avtomatik to'xtaydi. Token xato bo'lsa uni tuzating; yangi reja orqali qayta tekshiring. Xabarni Telegram qabul qilib, keyin backend javobni yoki DB commit'ni yo'qotsa, qayta urinishda kamdan-kam takroriy xabar kelishi mumkin; Telegram Bot API yuborish uchun idempotency kaliti bermaydi. Bir vaqtda ishlayotgan workerlar bitta recipient qatorini FOR UPDATE SKIP LOCKED bilan himoya qiladi.

Sozlash tekshiruvi:

- Backendda GET /api/health ishlasin.
- Kuzatuvchida GET /api/notifications/telegram: configured: true.
- Ulashdan so'ng connected: true.
- Usta/PTO reja kiritib saqlasin; kuzatuvchining qo'ng'irog'ida xabar paydo bo'lsin.
- Telegram botdan yangi reja, zavod, sana, muallif va miqdor xabari kelsin.
- Rejani o'zgartirmasdan faktni saqlash takroriy reja xabarini yaratmasin.

Rasmiy hujjatlar: [Telegram Bot API](https://core.telegram.org/bots/api), [Bot deep linking](https://core.telegram.org/bots/features#deep-linking).
## Sinovlar

`backend` papkasida `npm test` — umumiy regressiya, kunlik reja bildirishnomalari va Telegram sinovlarini ketma-ket bajaradi. Barchasi vaqtinchalik sxemada ishlaydi; Telegram sinovida haqiqiy tarmoq xabarlari yuborilmaydi. Alohida: `npm run test:notifications`, `npm run test:telegram`.

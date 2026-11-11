# Zavodlar ish stoli — 4 zavod, PostgreSQL

## Foydalanuvchi yo‘riqnomasi

**Yangi bo‘lim:** [Kadrlar va oylik: ish tartibi, hisoblash qoidalari va huquqlar](docs/kadrlar-va-oylik.md).

- [O‘zbekcha — lotin](docs/qollanma-uz-lotin.md)
- [Ўзбекча — кирилл](docs/qollanma-uz-kirill.md)
- [Русский](docs/rukovodstvo-ru.md)

Yo‘riqnomalarda kirish, xodimlar vazifalari, ombor, reja, kunlik hisobot, jo‘natish va hisobot olish tartibi tushuntirilgan.

Eski `pto-app` ilovasining yangi versiyasi: **bitta ilova, bitta baza, bir nechta zavod**.
Baza MongoDB o'rniga **PostgreSQL**. Keyinchalik Ahost (cPanel, Toshkent, TAS-IX) serveriga joylanadi.

```
zavodlar-app/
├── backend/    Express 5 + PostgreSQL (pg)
└── frontend/   Next.js 16 — zavod tanlagich bilan
```

## Holat

| Bosqich | Nima | Holat |
|---|---|---|
| 1 | Backend PostgreSQL'ga ko'chirildi, zavodlar (`factory_id`) qo'shildi | ✅ tayyor, sinovdan o'tgan |
| 2 | Frontend: zavod tanlagich, «Zavodlar» boshqaruvi, foydalanuvchini zavodga biriktirish | ✅ tayyor |
| 3 | Umumiy panel: 4 zavod bir ekranda (bugun, oylik natija, solishtirish, ombor va buyurtmalar) | ✅ tayyor |
| 3a | pto-app'ning 30-sentyabrdan keyingi barcha yangiliklari ko'chirildi (pastda ro'yxat) | ✅ tayyor |
| 4 | Metall konstruksiya zavodi uchun ishlab chiqarish moduli | ⏳ |
| 5 | Ahost'ga joylash, har kungi avtomatik zaxira | ⏳ |

## Vercel'ga joylash (ko'rsatish uchun)

Vercel'da **ikkita loyiha** bo'ladi (bitta GitHub repozitoriydan): backend va frontend. Baza — **Neon** (bepul PostgreSQL, Vercel ichidan ulanadi).

1. **GitHub**: github.com → New repository → nomi masalan `zavodlar`, **Private**. Keyin kompyuterda (`zavodlar-app` papkasida):
   ```bash
   git init
   git add .
   git commit -m "zavodlar-app"
   git branch -M main
   git remote add origin https://github.com/<login>/zavodlar.git
   git push -u origin main
   ```
   `.gitignore` parollar (`.env`), `node_modules`, zaxira fayllari va `_eski_nusxa_*` papkalarini yubormaydi.
2. **Backend**: Vercel → Add New → Project → repozitoriy → **Root Directory: `backend`**, Framework: *Other* → Deploy.
   Keyin loyiha → **Storage → Create Database → Neon** → shu loyihaga ulang (`DATABASE_URL` o'zi qo'shiladi).
   **Settings → Environment Variables**: `AUTH_SECRET` (uzun tasodifiy satr), `APP_PASSWORD` (birinchi kirish paroli),
   `CORS_ORIGIN` (frontend manzili; birinchi marta `*` qo'yish mumkin). So'ng **Redeploy**.
   Tekshirish: `https://<backend>.vercel.app/api/health` → `{"ok":true,...}`. Jadvallar birinchi so'rovda o'zi yaratiladi.
3. **Frontend**: Vercel → Add New → Project → o'sha repozitoriy → **Root Directory: `frontend`** →
   Environment Variables: `NEXT_PUBLIC_API_URL` = `https://<backend>.vercel.app` (oxirida `/` siz) → Deploy.
4. Backend'dagi `CORS_ORIGIN` ni frontend manziliga o'zgartiring va backend'ni **Redeploy** qiling.
5. Frontend manzilini oching: login `admin`, parol — `APP_PASSWORD`. Zavodlar va foydalanuvchilar «Boshqaruv»da qo'shiladi.

Ma'lumot yuklash (ixtiyoriy) — kompyuterda, `backend/.env` dagi `DATABASE_URL` ni vaqtincha Neon ulanish qatoriga almashtirib:
`npm run import-mongo -- …` yoki `npm run import-products -- …` (pastda). Keyin `.env` ni qaytaring.

## Kompyuterda ishga tushirish (backend)

Kerak: **Node.js 20.12+** va **PostgreSQL** (sizda bor).

**1. Baza yaratish.** pgAdmin'da yoki `psql` da:

```sql
CREATE DATABASE zavodlar;
```

**2. Sozlash va ishga tushirish** (PowerShell yoki VS Code terminali):

```bash
cd Desktop\zavodlar-app\backend
copy .env.example .env        # .env ni oching: DATABASE_URL dagi parolni o'zingiznikiga almashtiring,
                              # AUTH_SECRET ga uzun tasodifiy satr yozing
npm install
npm run dev                   # http://localhost:4000/api/health → {"ok":true,...}
```

Jadvallar birinchi ishga tushishda **avtomatik** yaratiladi (`sql/` papkasidagi fayllar).

**3. Birinchi kirish:** login `admin`, parol — `.env` dagi `APP_PASSWORD`. Bosh administrator va «1-zavod» avtomatik yaratiladi, keyin o'z parolingizni o'rnatasiz.

## Kompyuterda ishga tushirish (frontend)

Backend ishlab turgan holda, **ikkinchi** terminalda:

```bash
cd Desktop\zavodlar-app\frontend
copy .env.example .env.local      # NEXT_PUBLIC_API_URL=http://localhost:4000
npm install
npm run dev                       # http://localhost:3000
```

Bosh ofis foydalanuvchisida chap menyuning tepasida (telefonda — sarlavha yonida) **zavod tanlagich** chiqadi.
Yangi zavod: **Boshqaruv → Zavodlar → Zavod qo'shish**. Foydalanuvchini zavodga: **Boshqaruv → Foydalanuvchilar**.

## Zaxira nusxa va tiklash

«Boshqaruv → Zaxira nusxa → Yuklab olish» → `zavod-backup-….json` (bosh ofis admini — hamma zavod, zavod admini — o'z zavodi).

```bash
npm run restore -- zavod-backup-XXXX.json          # nima tiklanishini ko'rsatadi
npm run restore -- zavod-backup-XXXX.json --yes    # tiklaydi (oldin joriy holat avto-zaxiraga saqlanadi)
```

## Eski ilovadagi ma'lumotlarni ko'chirish

1. Eski ilovada: **Boshqaruv → Zaxira nusxa → Yuklab olish** → `pto-backup-....json` fayli.
2. Faylni `backend` papkasiga qo'ying va:

```bash
npm run import-mongo -- pto-backup-XXXX.json zavod-1           # nima ko'chishini ko'rsatadi
npm run import-mongo -- pto-backup-XXXX.json zavod-1 --yes     # ko'chiradi
```

Xato bo'lsa, bazaga hech narsa yozilmaydi (hammasi bitta tranzaksiyada). Foydalanuvchilar ko'chmaydi (zaxirada parol yo'q) — ularni qaytadan qo'shasiz.

## Mahsulotlar ro'yxatini katalogga qo'shish (masalan, metall zavodi)

`scripts/data/metall-mahsulotlar.json` — «Самарканд ПУ» mexanika sexining 2026 fevral–avgust «Выпуск» hisobotlaridan olingan 101 ta mahsulot
(marka, guruh, og'irligi, hisobotdagi narxi).

```bash
npm run import-products -- scripts/data/metall-mahsulotlar.json samarqand-metall --name="Самарканд ПУ (metall)"         # nima qo'shilishini ko'rsatadi
npm run import-products -- scripts/data/metall-mahsulotlar.json samarqand-metall --name="Самарканд ПУ (metall)" --yes   # qo'shadi
```

Zavod kodi bo'yicha zavod bo'lmasa, «metall» turi bilan yaratiladi. Katalogda bor markalar qayta qo'shilmaydi — buyruqni ikki marta ishga tushirish xavfsiz.
Og'irlik kalkulyatsiyadagi «metall, kg» ga, hisobotdagi narx (QQS bilan) «Kalkulyatsiya»dagi «Excel faylidagi narx»ga yoziladi; sarf normalari keyin «Katalog»da to'ldiriladi.

## Zavodlar va foydalanuvchilar

- Har bir ma'lumot (material, mahsulot, kunlik hisobot, ombor, buyurtma…) o'z zavodiga tegishli.
- **Har bir zavodning o'z xodimlari va rahbari bor** (zavod rahbari, ПТО, usta, omborchi, buxgalter, zavod admini). Ular faqat o'z zavodini ko'radi va o'z zavodiga ma'lumot kiritadi. Zavod admini / rahbari faqat o'z zavodi foydalanuvchilarini boshqaradi.
- **Bosh ofis** (zavodga bog'lanmagan) faqat uch rol bo'lishi mumkin:
  - **Kuzatuvchi — bosh nazoratchi**: hamma zavodni ko'radi («Umumiy panel» + har bir zavod bo'limlari), Excel yuklab oladi, **hech narsa kiritmaydi**. Kirganda «Umumiy panel» ochiladi.
  - **Kurator**: faqat ko'radi.
  - **Administrator**: texnik sozlash — zavodlar qo'shish, har zavodga birinchi admin/rahbarni yaratish, zaxira.
- API'da bosh ofis foydalanuvchisi zavodni `X-Factory: <zavod id>` sarlavhasi bilan tanlaydi.
- Zavod qo'shish: `POST /api/factories` `{ code: "zavod-2", name: "2-zavod", kind: "beton" | "metall" }` (faqat bosh ofis admini).

Parol unutilsa yoki foydalanuvchini terminaldan qo'shish:

```bash
npm run user -- admin YangiParol123                          # bosh administrator paroli
npm run user -- aziz Parol123 pto zavod-2 "Aziz Karimov"     # 2-zavod ПТО muhandisi
```

## pto-app'dan ko'chirilgan imkoniyatlar

Hammasi har zavod uchun alohida ishlaydi (zavod tanlagichdagi zavod bo'yicha). Batafsil qoidalar — pto-app README'sida.

- **Buxgalter roli** va **«Material hisoboti»** bo'limi: oyda quyilgan mahsulotlar ro'yxati, tuzatib saqlash, asl blankda Word (DOCX). Shablon: `frontend/public/templates/material-hisobot.docx`.
- **Tijorat taklifi (Word)** — «Kalkulyatsiya» bo'limida. Shablon: `frontend/public/templates/tijorat-taklifi.docx`.
- **Tasdiqlangan reja** («Buyurtmalar rejasi» → «Tasdiqlangan reja»): Excel'dan yuklash yoki qo'lda tuzish, fakt bilan solishtirish, kunlik reja PDF va Excel; kunlik hisobotda «Tasdiqlangan rejadan to'ldirish». Dastur rejasida — tanlangan buyurtmalar bo'yicha reja va «Kunlik reja (PDF)».
- **Накладная (PDF)** — «Kunlik hisobot» → «Jo'natish». Отправитель, накладная raqami va haydovchilar shu brauzerda **har zavod uchun alohida** eslab qolinadi.
- **Buyurtmalar**: shartnoma (договор) raqami va «tizimdan oldin jo'natilgan» soni; jo'natilgan mahsulotni buyurtmadan olib tashlab bo'lmaydi; kunlik hisobotdagi jo'natish faqat shu mahsulot bor buyurtmaga bog'lanadi.
- **Marka tuzatish (пересортица)** — «Tayyor mahsulot»da xato kiritilgan markani boshqasiga o'tkazish (ПТО, admin, rahbar).
- **Lotok qopqoqlari** («д»li marka) dastur rejasida asosiy lotok qolibiga partiya bo'lib rejalashtiriladi.
- Omborchi uchun **yangi material qo'shish oynasi**; bir xil nomli material ikki marta qo'shilmaydi.
- Telefonga o'rnatish tugmasi va ko'rsatmasi (yangilangan).

Bazaga o'zgarishlar `sql/003_pto_features.sql` da — backend birinchi ishga tushganda **avtomatik** qo'llanadi (mavjud buyurtmalar saqlanib qoladi). Frontend'da yangi kutubxona bor, shuning uchun bir marta `npm install` qiling.

## Накладная, ulashish va pto-app yangiliklari (2026-10-09)

- **Накладная → jo'natish**: «Kunlik hisobot» → «Накладная (PDF)». Накладнаяga yozilgan mahsulotlar PDF tayyorlanganda shu kunning
  jo'natishiga **avtomatik** qo'shiladi (shartnoma tanlangan bo'lsa — o'sha buyurtmaga bog'lanadi) va kun saqlanadi. Mavjud jo'natishdan
  ochilgan накладная o'sha qatorlarni yangilaydi (ikki marta qo'shilmaydi). Ulashish bekor qilinsa — jo'natishga yozilmaydi.
  «+ Jo'natish qo'lda» tugmasi zaxira sifatida qoldi.
- **Накладная PDF**: yuqori o'ng burchakda muhr (shtamp) uchun bo'sh joy (~44×43 mm, ostida «М.П.»); summalar xonalarga ajratiladi.
- **Ulashish (Telegram)**: barcha Excel / PDF / Word tugmalari yonida «Ulashish» bor. iPhone'da fayl tayyorlanguncha Safari ruxsati
  tugasa, «Fayl tayyor» oynasi chiqadi — undagi «Ulashish (Telegram)» bosilganda ulashish oynasi ochiladi. iPhone'da «Yuklab olish» ham
  ulashish oynasi orqali ishlaydi («Fayllarga saqlash» bor). Zaxira nusxa (butun baza) ataylab faqat yuklab olinadi.
- **pto-app'dan**: tasdiqlangan rejani **usta** ham tuzadi va saqlaydi (o'chira olmaydi); tasdiqlangan reja ostida **material sarfi** bloki;
  «Kalkulyatsiya»da **guruhlar** bo'yicha ko'rish; mahsulot xarajatlarini andozadan ajratib, faqat o'zi uchun tahrirlash va andozaga qaytarish.

## Tekshiruv hisobotidagi xatolar tuzatildi (2026-10-09)

«2026-10-08-review.md» dagi topilmalar zavodlar-app'da tuzatildi va sinovdan o'tkazildi:

- **Kunlik hisobot**: kun yuklanmasa, oldingi kunning jadvali ekranda qolmaydi, saqlash va Excel yopiladi («Qayta yuklash» tugmasi chiqadi).
  Ikki xodim bir kunni tahrirlasa, kech saqlagani rad etiladi (409) — birinchisining o'zgarishi o'chib ketmaydi; ekranda «Qayta yuklash» taklif qilinadi.
- **Material hisoboti va oylik reja / oylik hisobot**: oy tez almashtirilganda kech kelgan eski oy javobi e'tiborsiz qoldiriladi.
  Material hisobotida saqlanmagan o'zgarish bo'lsa, bo'limdan chiqish, zavod almashtirish, chiqish va sahifani yopishda so'raladi.
  Imzolar endi shu oydan **oldingi** hisobotdan olinadi; birinchi hisobotda bo'sh (boshqa zavod xodimlari ismi tushmaydi).
- **Excel (kunlik va oylik)**: tayyor mahsulot qoldig'iga ombordan brakka chiqarish va marka tuzatishlari qo'shildi
  (shakl ustunlari o'zgarmadi — «Остатка» formulasida va katak izohida). Faqat shunday harakat bo'lgan kun ham oylik faylga kiradi.
  Oylik Excel oydagi barcha ombor harakatlarini oladi (avval 2000 tadan keyingilari tushib qolardi).
- **Kunlik hisobot ekrani**: tayyor mahsulot qoldig'ida marka tuzatishi ko'rsatiladi va hisobga olinadi.
- **Dastur rejasi**: «tayyor» holatdagi buyurtmalarning jo'natilmagan mahsuloti boshqa buyurtmaga ombordan berilmaydi.
- **Orqa sana bilan chiqim**: o'sha kuni boshqa harakat bo'lmasa ham qoldiq tekshiriladi (keyingi kirim eski kundagi yetishmovchilikni yashirmaydi).
- **Inventarizatsiya**: sanash va tasdiqlash o'zgarishlar tarixiga yoziladi; ikki xodim bir vaqtda sanasa, biri ikkinchisinikini o'chirmaydi.
- **Sanalar**: `2026-02-30`, `2026-99-99`, `2026-13` kabi mavjud bo'lmagan sana va oylar qabul qilinmaydi.
- **O'chirish**: boshlang'ich qoldig'i, inventarizatsiyasi, tasdiqlangan rejasi yoki material hisoboti bor material/mahsulot o'chirilmaydi.

## Eski versiyaga nisbatan tuzatilganlar

- **Kelajakdagi sana** bilan kirim/chiqim yozib bo'lmaydi.
- Chiqim (orqa sana bilan ham) **keyingi birorta kunni minusga tushirmasligi** tekshiriladi; kirimni bekor qilishda ham.
- Bir vaqtda kelgan ikki chiqim qoldiqdan o'tib keta olmaydi (material bo'yicha qulf + tranzaksiya).
- Inventarizatsiyani tasdiqlash — hujjat va to'g'rilashlar **bitta tranzaksiyada**.
- Omborchi materialning **o'lchov birligini** o'zgartira olmaydi; harakat bo'lgan materialda umuman o'zgarmaydi.
- `AUTH_SECRET` majburiy (bo'lmasa server tokenlarni imzolamaydi).
- IP aniqlash proksi ortida soxtalashtirilmaydi (`TRUST_PROXY=1`).

## API

Eski ilova bilan **bir xil** (frontend deyarli o'zgarmaydi) + yangilari:

| Metod | Yo'l | Tavsif |
|---|---|---|
| GET | `/api/me` | + `factory` (joriy zavod) va `factories` (tanlash mumkin bo'lganlar) |
| GET/POST, PUT `:id` | `/api/factories` | zavodlar (qo'shish/o'zgartirish — bosh ofis admini) |
| GET | `/api/overview?month=YYYY-MM` | umumiy panel: har zavod bo'yicha bugun, oy, o'tgan oy, qoldiq, buyurtmalar (faqat bosh ofis) |
| GET/POST, PUT/DELETE `:id` | `/api/users` | + `factoryId` maydoni |
| GET/POST, PUT/DELETE `:id` | `/api/orders` | `contractNo`, `items: [{ productId, qty, price, shippedBefore }]` (eski `lines` ham qabul qilinadi); javobda har qatorda `shipped`, `left` |
| GET/PUT/DELETE | `/api/acct-reports/:month` | buxgalteriya material hisoboti (saqlash — buxgalter, ПТО, admin, rahbar) |
| GET, GET/PUT/DELETE `:month` | `/api/month-plans` | tasdiqlangan oylik reja (saqlash — ПТО, admin, rahbar) |
| POST, DELETE `:id` | `/api/product-moves` | + `type: "fix"`, `toProductId` — marka tuzatish |
| GET | `/api/plan?orders=id1,id2&days=N` | tanlangan buyurtmalar bo'yicha reja |

Qolgan yo'llar (`/materials`, `/products`, `/days`, `/stock`, `/movements`, `/orders`, `/plan`, `/dashboard`, `/inventories`, `/suppliers`, `/finished`, `/vehicles`, `/settings`, `/audit`, `/backup`) — eski README'dagidek, faqat tanlangan zavod doirasida.

## Backend regressiya sinovlari

`backend` papkasida `npm test` — kunlik hisobot IDlarining zavodga tegishliligi, parallel yozish paytidagi zaxira izchilligi va oxirgi bosh administrator himoyasini PostgreSQL bilan tekshiradi. `.env` dagi baza ulanishi kerak. Sinov alohida vaqtinchalik sxemada ishlaydi va oxirida uni o‘chiradi; mavjud ilova jadvallari o‘zgarmaydi. Baza foydalanuvchisiga sxema yaratish huquqi kerak.

## Kunlik reja bildirishnomalari

Kunlik reja saqlanganda faol kuzatuvchilarga ilova ichida xabar chiqadi. Telegram xabarlari uchun bot va har bir kuzatuvchining ulanishi kerak. Sozlash: [README-notifications.md](README-notifications.md).

## Finansiviy va jo‘natish tafsilotlari

Oylik vedomosti, material hisoboti, buyurtmalar realizatsiyasi, faktura PDF va to‘lovlar: [qo‘llanma](docs/finansiviy.md). Migratsiya: `009_finance_dispatch.sql`.

# Kadrlar va oylik

Bo‘lim har bir zavod uchun alohida ishlaydi. Xodim kartochkasi dasturga kirish hisobidan mustaqil: barcha xodimlarga login yaratish shart emas.

## Xodim kabineti va shaxsiy delo

2026-11-03: kadrlar oynalari uchun izohli navigatsiya, xodimlar ro‘yxatida faol soni va boshlash yo‘li, kabinetda to‘rt qadamli rasmiylashtirish paneli qo‘shildi. Qoralama hujjatlar sariq, rasmiylashtirilganlari yashil; bog‘liq shartnoma yoki kelishuv tayyor bo‘lmasa buyruq tasdig‘i nofaol va sababi ko‘rsatiladi. Xodim va hujjat formalari mavzular bo‘yicha guruhlangan. Hisob oyi sozlamalari xodimlar ro‘yxatidan Tabel va hisob oynalariga ajratildi. `/help/kadrlar-qollanma.pdf` havolasi kadrlar oynalari va kabinetdan to‘qqiz sahifali, rasmli o‘zbekcha qo‘llanmani ochadi.

Menyuda **Kadrlar nazorati, Xodimlar, Tabel, Hujjatlar** qoldirilgan. Markazga ruxsati bo‘lmagan buxgalter va ustaga mavjud Hisobotlar yo‘li saqlanadi. Ta’til, smena, hujjat muddatlari, himoya vositalari, oylik va to‘lovlar ichki **Qo‘shimcha bo‘lim** ro‘yxatidan ochiladi; ro‘yxat foydalanuvchi vakolatiga mos.

**Xodimlar → Ko‘rish** shaxsiy kabinetni ochadi. Bu kadrlar mutaxassisi ko‘radigan kartochka, my.gov bilan ulanish yoki xodim uchun yangi login emas. Unda odamcha avatar, pasport/ID, JShShIR, tug‘ilgan sana va joy, ikki telefon, doimiy va hozirgi manzil, ma’lumot, diplom, mutaxassislik, staj va yaqin kishisining aloqalari mavjud.

**Shaxsiy delo** foydalanuvchi yuborgan ro‘yxatdagi to‘qqiz turdagi hujjatni, zarur hollarda harbiy hisob va JShShIR hujjatini, imzolangan shartnoma/buyruq nusxalarini saqlaydi. Holatlar: kutilmoqda, olindi, tatbiq etilmaydi. Barcha ma’lumotnomalar barcha lavozimlar uchun majburiy deb belgilanmagan. PDF, JPG va PNG, har biri 3 MB gacha; fayllar vaqtinchalik server diskida emas, bazada saqlanadi, oddiy havola bilan ochilmaydi. Kabinet va fayllarga admin, rahbar va kadrlar kiradi; buxgalter va ustaga bu API yopiq.

## Shartnoma va buyruqlar

Yangi xodim saqlanganda mehnat shartnomasi va unga bog‘langan qabul buyrug‘i qoralamalari avtomatik ochiladi. Oldin kiritilgan xodim uchun **Yangi shartnoma**, keyin **Ishga qabul buyrug‘i** tugmalaridan foydalaniladi. Har bir zavodning **Korxona rekvizitlari** bir marta kiritiladi; oldingi qoralamani yangilash uchun uni qayta saqlash kerak.

1. Shartnoma raqami, sana, ish joyi, lavozim, ish rejimi, maosh, qo‘shimchalar va ta’til shartlarini kiriting. Muddatli shartnoma uchun muddati va huquqiy asosi alohida ko‘rsatiladi.
2. PDFni tekshiring, tomonlar qog‘ozda imzolaydi. Rahbar yoki admin **Imzolanganini tasdiqlash** orqali imzolar va huquqiy asoslar tekshirilganini belgilaydi. Bu ERI emas va davlat tizimiga yubormaydi.
3. Shartnoma tasdiqlangach qabul buyrug‘ini rasmiylashtiring. Buyruq aynan imzolangan shartnoma shartlarini oladi, maosh yozuvini tegishli sanadan yaratadi. Imzolangan shartnomadan keyin xodim kartochkasi o‘zgarsa, hujjat qayta rasmiylashtiriladi.
4. **Lavozimini o‘zgartirish** yangi lavozim, bo‘lim, yozma rozilik, dastlabki shartnoma va qo‘shimcha kelishuv rekvizitlarini so‘raydi. Kelishuv va buyruq birgalikda qoralama yaratiladi. Avval kelishuv imzolangani tasdiqlanadi, so‘ng unga mos buyruq qo‘llanadi.
5. **Ishdan bo‘shatish** shartnoma rekvizitlari, sabab, tasdiqlovchi hujjat va huquqiy asosni so‘raydi. Taraflar kelishuvi, muddat tugashi va xodim tashabbusi alohida variantlar; boshqa asos uchun aniq modda, qism va band qo‘lda kiritiladi. Ish beruvchi tashabbusi uchun asos tizim tomonidan taxmin qilinmaydi. Buyruq tasdiqlanganda oxirgi ish kuni kartochkaga yoziladi.

Foydalanuvchi yuborgan bir sahifali buyruq va to‘rt sahifali shartnoma tuzilishi asos qilib olindi. Skanlardagi haqiqiy shaxsiy ma’lumotlar, imzo va muhr ko‘chirilmagan. PDFlar bosib chiqarish uchun; hajmli matn sahifalarni uzaytirishi mumkin. Ochiq litsenziyali Liberation Serif ishlatiladi, lotin va o‘zbek kirill harflari qo‘llanadi.

Hujjatlar qoralama sifatida tayyorlanadi. Amaldagi sharoit, xodim toifasi, sinov cheklovlari, muddatli shartnoma asosi, ogohlantirish muddatlari va kompensatsiyalar imzolashdan oldin mas’ul tomonidan tekshiriladi. Tizim mehnat nizosi yoki yakuniy hisob-kitobni avtomatik hal qilmaydi. Rasmiylashtirilgan nusxa keyingi kartochka o‘zgarishlaridan mustaqil saqlanadi; yopilgan hisob davriga ta’sir qiladigan buyruq va kelajak sanasidagi kadrlar o‘zgarishi qo‘llanmaydi. Hujjat holati, xodim lavozimi va maosh o‘zgarishi bitta tranzaksiyada amalga oshadi.

Huquqiy manba: [O‘zbekiston Respublikasi Mehnat kodeksi, Lex.uz](https://lex.uz/docs/-6257288), 2026-11-03 kuni tekshirildi: ishga qabulda 127-modda; doimiy o‘tkazishda 138, 140, 149-moddalar; bekor qilishda tegishli asos va 170–172-moddalar; ishga kirish hujjatlari uchun 124-modda. Namunadagi eski tasdiqlash yozuvi aynan ko‘chirilmagan.

Zaxira nusxa `hr_employers`, `hr_employment_docs`, `hr_employee_files` jadvallarini ham oladi. Tiklashda uchtasi bir guruh sifatida tekshiriladi; eski zaxira nusxada butun guruh bo‘lmasa, mavjud kadrlar hujjatlari o‘chirilmaydi. Zaxirada shaxsiy hujjatlar borligi sababli uni faqat vakolatli shaxs saqlashi kerak.

## Boshlash

1. **Boshqaruv → Foydalanuvchilar**da kadrlar mutaxassisi va buxgalterni kerakli zavodga biriktiring.
2. **Kadrlar va oylik → Xodimlar → Yangi xodim**da noyob tabel raqami, F.I.Sh., lavozim, sex va ishga kirish sanasini kiriting.
3. Buxgalter yoki rahbar **Maosh tarixi → Maosh belgilash** orqali lavozim maoshi, to‘liq oy uchun koeffitsiyent haqi va amal qilish sanasini kiritsin. Birinchi maosh sanasi ish boshlangan davrni qamrab olishi kerak.
4. **Hisob oyini ochish**ni bosing. Tavsiya etilgan norma dushanba-juma kunlari × 8 soat asosida hisoblanadi. Tashkilotingizning haqiqiy normasi bilan tekshirib almashtiring.
5. **Oy sozlamalari**da ish haftasi, dam olish sanalari va normani tekshiring. Haftada 1=dushanba, 2=seshanba, …, 6=shanba, 0=yakshanba. Dam olish sanalarini `2026-11-09,2026-11-10` kabi kiriting. Norma mustaqil maydon: ish haftasi yoki dam olish sanalari o‘zgarsa, normani ham tekshiring.
6. **Tabel**da xodimni tanlang, har kunning holati, soati va smenasini kiriting. Jadvaldan to‘ldirish faqat 8 soatlik namuna yaratadi. Haqiqiy davomatni tekshirib, **Tabelni saqlash**ni bosing.
7. **Oylik hisoblash**da qo‘shimcha haq, xizmat safari, ushlanma va birinchi hisobdagi qarzni kiriting. Tekshirgach oylikni tasdiqlang.
8. **To‘lovlar**da avans yoki oylik to‘lovini naqd/karta usuli bilan yozing. Sana pul haqiqatan berilgan sana; hisob oyi esa to‘lov qaysi oyning qarzini kamaytirishini bildiradi.
9. Hamma to‘lov tekshirilgach **Oyni yopish**ni bosing. To‘lanmagan yoki ortiqcha to‘langan qoldiq keyingi hisobga o‘tadi.

## Hisoblash qoidalari

Google Sheetsdagi namuna asos qilib olindi. Jadvaldagi haqiqiy xodimlar va ularning maoshlari avtomatik ko‘chirilmagan; Sheets fayllari o‘zgartirilmagan.

- Ishlangan vaqt haqi = lavozim maoshi / oy soati normasi × ishlangan soat.
- Koeffitsiyent haqi = to‘liq oy uchun koeffitsiyent haqi / oy soati normasi × ishlangan soat.
- Jami hisoblandi = ishlangan vaqt haqi + koeffitsiyent haqi + qo‘shimcha haq + xizmat safari haqi.
- Daromad solig‘i = jami hisoblandi × oy sozlamasidagi foiz.
- Sof hisoblangan = jami hisoblandi − soliq − boshqa ushlanmalar.
- To‘lanishi lozim = oldingi qarz + sof hisoblangan − naqd to‘langan − kartaga to‘langan.

Boshlang‘ich sozlamadagi **12%** soliq va maosh formasidagi **247 500 so‘m** koeffitsiyent haqi namuna jadvaldan olingan. Buxgalter ularning xodim va davrga mosligini tekshiradi. 168 soat doimiy qilib belgilanmagan: har oy o‘z normasiga ega.

Hisob pulning yuzdan birigacha yaxlitlanadi. Soatga mutanosib haq va soliq butun sonli pul hisoblari orqali hisoblanadi. Oy o‘rtasida maosh o‘zgarsa, har bir ishlangan kunga o‘sha sanada amal qilgan maosh qo‘llanadi, so‘ng oylik yig‘iladi.

Maosh tarixidagi yozuv xato bo‘lsa, tasdiqlanmagan davrda **Tahrirlash** orqali tuzatiladi va o‘zgarish jurnalga yoziladi. Tasdiqlangan davrda bu tugma yopiladi.

**Muhim:** ta’til puli, kasallik nafaqasi, tungi yoki ortiqcha ish ustamalari alohida qoidalar bo‘yicha avtomatik hisoblanmaydi. Davomat holati va smena qayd etiladi; tegishli haqni buxgalter tekshirib qo‘shimcha haq yoki xizmat safari maydoniga kiritadi. Ish haqi kalendari va bayramlar avtomatik ravishda huquqiy manbadan olinmaydi.

Manfiy qarz xodimga ortiqcha to‘lov yoki avans berilganini bildiradi; keyingi oyga shu ishora bilan ko‘chadi. Oldingi hisobda mavjud bo‘lgan xodimning qarzi avtomatik olinadi. Yangi xodimning dasturdagi birinchi hisobiga boshlang‘ich qarz kiritish mumkin.

## Holatlar va himoya

| Holat | Ruxsat etilgan amallar |
|---|---|
| Qoralama | Tabel, oy sozlamalari, qo‘shimchalar va to‘lovlarni kiritish. |
| Tasdiqlangan | Tabel va hisob summalari saqlangan nusxa sifatida muzlatiladi. Faqat to‘lov yozish yoki xato to‘lovni sabab bilan bekor qilish mumkin. |
| Yopilgan | Shu oyda tabel, hisob va to‘lovlarni o‘zgartirib bo‘lmaydi. Qoldiq keyingi oyga o‘tadi. |

Oldingi hisob oyi yopilmaguncha keyingi oylik tasdiqlanmaydi. Tasdiqlangan davr uchun orqa sana bilan yangi maosh qo‘shilmaydi. Yopilgan davrdan oldin yangi hisob oyi ochilmaydi. Ushbu versiyada tasdiqlashni bekor qilish yoki yopilgan oyni qayta ochish tugmasi yo‘q: yakunlashdan oldin tekshiring.

Ikki xodim bir vaqtda yozsa, eski nusxa bilan saqlash rad etiladi. **Qayta yuklash**dan oldin saqlanmagan o‘zgarishlarni solishtiring. To‘lovning qayta yuborilishi ikkinchi to‘lov yaratmaydi. Xato to‘lov o‘chirilmaydi: sabab bilan bekor qilinadi va tarixi qoladi.

## Huquqlar

| Rol | Imkoniyat |
|---|---|
| Administrator, zavod rahbari, buxgalter | Xodimlar, maoshlar tarixi, tabel, hisob, to‘lovlar, tasdiqlash/yopish va moliyaviy hisobotlar. |
| Kadrlar mutaxassisi | Xodim kartochkalari, oy normasi va ish jadvali, tabel va tabel eksporti. Maosh, soliq, oylik va to‘lovlar ko‘rinmaydi. Dasturdagi boshqa ish bo‘limlari yopiq. |
| Usta | O‘z zavodining xodimlarini qisqa ro‘yxatda ko‘rish, ochilgan oyda tabel kiritish va eksport qilish. Telefon, shaxsiy izohlar va maosh ko‘rinmaydi. |
| ПТО, omborchi, kuzatuvchi, kurator | Kadrlar va oylik ma’lumotlariga ruxsat berilmaydi. |

Zavodga biriktirilgan hisob boshqa zavodning ma’lumotiga o‘ta olmaydi. Bosh ofis administratori zavod tanlagichi orqali kerakli zavod bilan ishlaydi.

## Hisobot va zaxira

**Hisobotlar**da tabel va oylik vedomostini Excelda olish mumkin. Vakolatli foydalanuvchi xodimni tanlab, alohida hisob varaqasini Excelda oladi yoki chop etadi. Chop etish oynasidan PDF sifatida saqlash mumkin. Kadrlar xodimi va ustaning faylida moliyaviy varaq bo‘lmaydi.

Kadrlar jadvallari asosiy zaxira nusxaga kiradi. Yangi zaxirani tiklashda xodim, maosh tarixi, oylar, to‘lovlar va voqealar birga tiklanadi. Kadrlar bo‘limi bo‘lmagan eski zaxirani tiklash mavjud kadrlar ma’lumotlarini saqlab qoladi; chala kadrlar zaxirasi qabul qilinmaydi.


## Hujjatlar markazi (2026-11-05)

**Kadrlar bo‘limi → Hujjatlar** yoki xodim kabinetidagi **Hujjatlar markazi** tugmasi barcha mavjud kadrlar hujjatlarini bitta oynada ochadi. Xodim, bo‘lim, yil, holat, hujjat turi, ism, raqam va fayl nomi bilan qidiriladi. Shartnoma va buyruqlar PDF, shaxsiy delo fayllari esa asl yuklangan shaklda olinadi. Xodim nomi bosilganda kabinet ochiladi. Davlat My Mehnat tizimi bilan integratsiya qilinmagan.

- **Tabelni yuklab olish · Excel:** saqlangan oy, tanlangan bo‘lim yoki xodim uchun A4 albom jadvali. Har kunning yuqori qatori holat, pastki qatori soat. F.I.Sh. bilan lavozim, bo‘lim, ish kuni, umumiy soat va ikki yarim oy soatlari, izoh va imzo joylari bor. Excelda soatlar o‘zgartirilsa, yakun formulalari qayta hisoblanadi. Bayram va ish haftasi soyasi saqlangan oy sozlamalaridan olinadi.
- **Bo‘sh tabel · Excel:** xodimlar va oy kunlari bilan to‘ldirilmagan blank; haqiqiy davomat sifatida ko‘rsatilmaydi. 28/29/30/31 kunlik oylar moslashadi.
- **Ma’lumotnoma / delo ro‘yxati · PDF:** tanlangan xodim uchun ma’lumotnoma qoralamasi yoki hujjatlar ro‘yxati. Ma’lumotnoma rekvizitlari va imzosi mas’ul tomonidan tekshiriladi.
- **Ta’til, smena va reyestrlar:** mavjud yozuvlardan PDF kartochka yoki ko‘chirma. Ular imzolangan huquqiy buyruqning o‘rnini bosmaydi. Ishga qabul, o‘tkazish va bo‘shatish buyruqlari alohida shartnoma/kelishuvga bog‘langan tartibda yuritiladi.
- **Hujjatlar reyestri · Excel:** ekranda filtrlangan natijalar ro‘yxati.
- **Tanlanganlarni yuklash · ZIP:** belgilangan fayllar bir arxivga yig‘iladi. Bir safar 30 tagacha hujjat, jami 30 MB gacha. Biror fayl olinmasa, chala arxiv berilmaydi.
- **Korxona hujjatini qo‘shish:** ichki nizom, lavozim yo‘riqnomasi, ariza, ma’lumotnoma yoki boshqa hujjat nusxasi. PDF/JPG/PNG, har biri 3 MB gacha. `hr_company_files` bazada saqlanadi; admin, rahbar va kadrlar uchun ochiq. Faylni yuklash davlat ro‘yxati yoki imzo tasdig‘i hisoblanmaydi.

Hujjatlar ro‘yxatida fayl tanasi va shaxsiy kartochkaning to‘liq nusxasi qaytarilmaydi. Yuklashda joriy huquq va zavod qayta tekshiriladi. Yangi korxona fayllari zaxira/tiklashga kiradi; eski zaxirada bu jadval bo‘lmasa, mavjud fayllar saqlanadi. Migratsiya: `008_hr_document_center.sql`. Tekshiruv: `tests/personnel.js`, `tests/hr-documents-browser.js`, frontend build.

## Texnik tekshiruv

- `backend`: `npm test` — vaqtinchalik PostgreSQL sxemalarida umumiy regressiya, bildirishnoma, Telegram va oylik testlari.
- `backend`: `npm run test:payroll` — moliyaviy hisob, huquqlar, zavod chegarasi, parallel yozuv, takroriy to‘lov, tarix va oy yopish testlari.
- `frontend`: `npm run build`.
- `backend/tests/hr-browser.js` — mahalliy, alohida sinov bazasida brauzer tekshiruvi; barcha API so‘rovlari sinov serveriga yo‘naltiriladi. Ish muhiti uchun avtomatik sinovga kiritilmagan: Playwright, Chrome va tayyor frontend build kerak.

Migratsiya: `backend/sql/005_hr_payroll.sql`. Ilova ishga tushganda mavjud migratsiya mexanizmi orqali qo‘llanadi.


## Yangilangan menyu va tabel

Yon menyuda **Kadrlar bo‘limi** alohida guruh. Uni bosganda Xodimlar, Tabel, Oylik hisoblash, To‘lovlar va Hisobotlar ochiladi. Oylik va to‘lovlar faqat vakolatli foydalanuvchilarga ko‘rinadi.

Tabelning ikki ko‘rinishi mavjud:

- **Kunlik ro‘yxat**: sanani tanlang. Xodimlar yonida Ishda, Kelmagan, Xizmat safari yoki boshqa holatni, ish soati va smenasini belgilang. So‘ng Tabelni saqlash tugmasini bosing.
- **Oylik kalendar**: xodimni tanlab, uning butun oydagi davomatini ko‘ring va tahrirlang.

Ikkala ko‘rinish bitta tabel ma’lumotidan foydalanadi. Tasdiqlangan va yopilgan oylar tahrirlanmaydi.

Kunlik tabeldagi **Bugun** tugmasi joriy oy va bugungi sanani tanlaydi. **Oylik tabel · Excel** tanlangan oyning barcha xodimlarini yuklab beradi. Excel faylida chop etish A4, albom va eni bir sahifa qilib sozlangan. Faylni ochib Chop etish orqali chiqarish mumkin. Xodimlar ko‘p bo‘lsa sahifalar pastga davom etadi. Har xodimning yuqori qatori holatni, pastki qatori ish soatini bildiradi; belgilar izohi jadval ostida berilgan.


## Kadrlar rahbari ish joyi

**Kadrlar nazorati** oynasida bugungi faol xodimlar, ishda bo‘lganlar, davomat belgilanganlar, ta’tildagilar va tasdiq kutayotgan yozuvlar ko‘rsatiladi. Muddati o‘tgan hamda yaqin 30 kunda tugaydigan hujjat va himoya vositalari yozuvlari alohida ro‘yxatda turadi. Oxirgi amallar kim va qachon bajargani bilan saqlanadi.

- **Ta’tillar:** har xodim va yil uchun kalendar kunlardagi limit va dasturdan oldin ishlatilgan kunlarni kiriting. Qoldiqdan tasdiqlangan kelajak ta’tillari ham ayriladi. Yil chegarasidan o‘tgan ta’til tegishli yillarga ajratiladi. Limit avtomatik huquqiy norma emas; kompaniya tasdiqlagan qiymatni kiriting.
- **Smena rejasi:** xodim, davr, hafta kunlari, kunduzgi/tungi smena va soatlar belgilanadi. Bu reja haqiqiy davomatdan alohida saqlanadi.
- **Buyruqlar:** ishga qabul, o‘tkazish, maosh o‘zgarishi va mehnat shartnomasini bekor qilish buyruqlari uchun reyestr. Tasdiqlash xodimning lavozimi yoki maoshini o‘z-o‘zidan o‘zgartirmaydi; tegishli kartochkada o‘zgarishni qayd eting.
- **Hujjat muddatlari:** mehnat shartnomasi, tibbiy ko‘rik, xavfsizlik yo‘riqnomasi va malaka hujjatining raqami hamda muddatini qayd eting. Asl fayl yuklash funksiyasi bu reyestrga kirmaydi.
- **Himoya vositalari:** berilgan buyum, miqdor, berish va qaytarish/almashtirish muddatini yuriting. Qaytarilganda yozuvni yakunlang.
- **Xodim kartochkasi:** tug‘ilgan sana, yashash manzili va favqulodda bog‘lanish uchun yaqin kishisi ma’lumotlari qo‘shilgan. Usta bu shaxsiy ma’lumotlarni ko‘rmaydi.

Ish tartibi: **Yangi yozuv → Qoralama → Tasdiqlash → Tabelga qo‘llash** (faqat ta’til va smena). Tasdiqlashni administrator, zavod rahbari va kadrlar xodimi bajaradi. Buxgalter qoralama tayyorlashi mumkin. Boshqa zavod ma’lumotlari ochilmaydi.

Tabelga qo‘llash barcha tegishli oylar ochiq va qoralama bo‘lganda amalga oshadi. Mavjud boshqa davomat ustiga yozilmaydi. Bir oyda xato chiqsa, boshqa oydagi o‘zgarish ham saqlanmaydi. Smena namunasini haqiqiy ishlangan soatlar bilan tekshirib boring. Ta’til pulini hisoblash va oylik qo‘shimchalari avvalgidek buxgalter nazoratida qoladi.

Qo‘llangan ta’til yoki smenani bekor qilishdan oldin tegishli tabel kunlarini qo‘lda tekshirib tuzating. Tasdiqlangan/yopilgan davr bekor qilinmaydi. Hujjat, buyruq va himoya vositasi yakunlanishi mumkin. Bekor qilishda sabab majburiy.

Yangi jadvallar zaxira nusxaga kiritiladi. Eski, kadrlar bo‘limisiz zaxira mavjud kadrlar ma’lumotlarini saqlaydi. Kadrlar bo‘limi bor, ammo yangi reyestrlarsiz eski zaxirani tiklash yangi reyestrlarni bo‘sh holatga qaytaradi. Chala yangi reyestr zaxirasi rad etiladi; tiklashdan oldin avtomatik nusxa olinadi.

Tekshiruvlar: `npm run test:workforce`, `node --env-file-if-exists=.env tests/workforce-browser.js`. Brauzer sinovi alohida vaqtinchalik bazada ishlaydi. Muddati yaqin yozuvlar ilova oynasida ko‘rinadi; Telegram orqali avtomatik kadrlar xabarlari hozircha yuborilmaydi.

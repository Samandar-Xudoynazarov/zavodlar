# Bosh administrator: JSON import

Boshqaruv → JSON import. Tugma faqat roli admin bo‘lgan va hech qaysi zavodga biriktirilmagan bosh administratorga ko‘rinadi. Zavod admini, rahbar va boshqa rollar APIga ham kira olmaydi.

1. Maqsad zavodni tanlang.
2. Eski ПТО/demo bazadan olingan pto-backup-….json faylini tanlang (8 MB gacha, app: pto, format: 1).
3. Faylni tekshirishni bosing. Material, mahsulot, kunlik hisobot, buyurtma, ombor va boshqa yozuvlar sonini hamda maqsad zavod nomini tekshiring.
4. Tanlangan zavodga yuklashni bosing.

Zavodda ma’lumot bo‘lsa, mavjud ishlab chiqarish, ombor, buyurtma va sozlamalarni almashtirish belgisi talab qilinadi. Oldingi holat shu import tranzaksiyasida avtomatik zaxiralanadi. Import tugagach yoki keyinroq importlar tarixidan oldingi zaxirani yuklash mumkin.

Moliyaviy yozuvlari (faktura, tushum yoki buyurtma bo‘yicha tayyor soni) bor zavodga almashtirish bloklanadi: yangi yoki bo‘sh zavodni tanlang. Kadrlar, tabel, ish haqi hamda foydalanuvchilar o‘zgarmaydi. Fayldagi foydalanuvchi loginlari va parollari import qilinmaydi.

Bir xil fayl bir zavodga ikkinchi marta qo‘shilmaydi. Ikki marta bosish ham takroriy yozuv yaratmaydi. Tekshirishdan keyin zavod ma’lumotlari o‘zgarsa, qayta tekshirish talab qilinadi. Importdagi har qanday xato butun importni bekor qiladi.

Eski MongoDB IDlari yangi UUIDlarga aylantiriladi; retseptlar, sarf normalari, ombor harakatlari va buyurtmaga bog‘langan jo‘natishlar shu zavod ichida qayta bog‘lanadi. Material narxlari tarixi ham saqlanadi. Manbada o‘chirilgan buyurtma jo‘natishlari buyurtmaga bog‘lanmagan holatda saqlanadi.

Eski PDFlar manba JSONda bo‘lmasa qayta yaratilmaydi. Ushbu tugma eski ПТО JSONlarini yuklash uchun; yangi ko‘p zavodli PostgreSQL zaxirasini tiklash uchun mavjud restore buyrug‘idan foydalaning.

Oldingi holat zaxirasini tiklash: backend papkasida npm run restore -- before-import-….json --yes. Bu fayl import almashtirgan ish ma’lumotlarini qaytaradi; kadrlar va foydalanuvchilar saqlanadi. Keyinchalik kiritilgan moliyaviy yozuvlar bo‘lsa, mavjud restore himoyasi ularni yo‘qotishga yo‘l qo‘ymaydi.

Migratsiya: 010_factory_import.sql avtomatik qo‘llanadi. Import arxivi to‘liq zaxiralarga kiradi.

Tekshirish: npm test yoki npm run test:import. Testlar vaqtinchalik alohida schema ichida ishlaydi.

## Xodimlar ro‘yxati

Eski ПТО JSONiga ixtiyoriy data.hrEmployees ro‘yxatini qo‘shish mumkin: _id, code, name, position, department, phone, hireDate, endDate, notes. Ism va noyob tabel raqami majburiy. Ishga kirish sanasi noma’lum bo‘lsa bo‘sh qoladi: bunday xodimlar ma’lumotlari to‘ldirilmagan deb ko‘rsatiladi va tabel/oylik hisobiga kirmaydi. Lavozim va buyruqlar keyin kiritiladi; import soxta shartnoma yoki buyruq yaratmaydi.

Xodimlar mavjud ro‘yxatga qo‘shiladi. Bir xil tabel raqami yoki ism avvaldan bo‘lsa import to‘liq rad etiladi. Shu faylni qayta yuborish yangi xodim yaratmaydi. Xodimlar qo‘shiladigan importdan oldin kadrlar jadvallari ham arxivlanadi; oldingi zaxirani tiklash avvalgi xodimlar holatini qaytaradi.

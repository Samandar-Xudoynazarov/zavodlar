# Ahost avtomatik zaxira

Bu dastur jadvalni o‘zi o‘rnatmaydi. cPanel Cron Jobs orqali faollashtiriladi.

1. Web katalogidan tashqarida /home/zavodlar/.zavodlar-backup.env fayl yarating, ruxsatini 0600 qiling. Gitga qo‘shmang.
2. DATABASE_URL, BACKUP_ENCRYPTION_KEY (64 ta tasodifiy hex belgi), BACKUP_DIR=/home/zavodlar/zavodlar-private-backups va BACKUP_KEEP=7 kiriting. Kalitni hostingdan tashqarida xavfsiz saqlang: kalitsiz zaxirani ochib bo‘lmaydi.
3. Tashqi nusxa uchun BACKUP_UPLOAD_URL (HTTPS PUT qabul qiluvchi manzil) va kerak bo‘lsa BACKUP_UPLOAD_TOKEN kiriting. Dastur tashqariga faqat shifrlangan faylni yuboradi. Yo‘naltirishlar qabul qilinmaydi.
4. Avval qo‘lda ishga tushirib, status va faylni tekshiring:

    /home/zavodlar/nodevenv/zavodlar-repo/backend/22/bin/node --disable-wasm-trap-handler --env-file=/home/zavodlar/.zavodlar-backup.env /home/zavodlar/zavodlar-repo/backend/scripts/backup.js

5. cPanel Cron Jobs: har kuni 02:30 uchun 30 2 * * * jadvali bilan shu buyruqni kiriting. Hostingning vaqt zonasini tekshiring. Log fayli ham web katalogidan tashqarida bo‘lsin.
6. Nusxani ochish: shu env fayl bilan scripts/backup-decrypt.js encrypted-file output.json. So‘ng mavjud scripts/restore.js orqali avval tekshiring, zarur bo‘lsa --yes bilan tiklang.

Nusxalar format-2 ilova zaxirasi: foydalanuvchi parollari kiritilmaydi. To‘liq PostgreSQL serverini tiklash o‘rniga ilova ma’lumotlarini tiklaydi. Eski nusxalarni o‘chirish faqat yangi nusxa va (sozlangan bo‘lsa) tashqi yuklash muvaffaqiyatli tugagach bajariladi. Yuklash xatosida mahalliy nusxa qoladi, muvaffaqiyat statusi yangilanmaydi.

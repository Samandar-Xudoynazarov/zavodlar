-- Oylikda ish beruvchi to'laydigan ijtimoiy soliq foizi (faqat ko'rsatish uchun; sof maosh hisobi o'zgarmaydi).
ALTER TABLE hr_months ADD COLUMN social_tax_rate numeric NOT NULL DEFAULT 12 CHECK (social_tax_rate >= 0 AND social_tax_rate <= 100);

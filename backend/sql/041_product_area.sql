-- Mahsulot kvadraturasi (m² / dona): kunlik hisobotda reja va fakt kvadraturani hisoblash uchun
ALTER TABLE products ADD COLUMN IF NOT EXISTS area numeric NOT NULL DEFAULT 0 CHECK (area >= 0);

-- Buyurtmaga «bekor» (bekor qilingan) holati qo'shiladi.
-- Bekor qilingan buyurtma ro'yxatdan yashiriladi va rejaga kirmaydi; jo'natma, faktura va to'lovlari o'z joyida qoladi.
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'orders'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE orders DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('yangi', 'jarayonda', 'tayyor', 'topshirildi', 'bekor'));

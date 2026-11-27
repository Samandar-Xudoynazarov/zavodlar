-- Mijoz nomlarini tozalash: ortiqcha (Excel/CSV dan qolgan) qo'shtirnoqlar, «» “” kabi tirnoqlar, ortiqcha bo'sh joylar.
-- Masalan: «""O`ZQISHLOQELEKTRQURILISH" AJ"» → «"O`ZQISHLOQELEKTRQURILISH" AJ».
-- Summalar o'zgarmaydi, faqat nom yozilishi bir xil bo'ladi. JS dagi cleanCustomerName (src/customer-name.js) bilan bir xil.
CREATE FUNCTION pg_temp.clean_customer(s text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE n int;
BEGIN
  s := btrim(regexp_replace(translate(coalesce(s, ''), '«»“”„‟″〝〞＂', '""""""""""'), '\s+', ' ', 'g'));
  s := regexp_replace(s, '"{2,}', '"', 'g');
  n := length(s) - length(replace(s, '"', ''));
  IF n % 2 = 1 THEN
    IF length(s) > 1 AND left(s, 1) = '"' AND right(s, 1) = '"' THEN s := left(s, -1);
    ELSIF n = 1 AND right(s, 1) = '"' THEN s := left(s, -1);
    ELSIF n = 1 AND left(s, 1) = '"' THEN s := substr(s, 2);
    END IF;
  END IF;
  RETURN btrim(regexp_replace(s, '\s+', ' ', 'g'));
END $fn$;

UPDATE orders SET customer = pg_temp.clean_customer(customer), updated_at = now()
 WHERE customer <> pg_temp.clean_customer(customer) AND pg_temp.clean_customer(customer) <> '';

UPDATE finance_receipts SET customer = pg_temp.clean_customer(customer)
 WHERE customer <> pg_temp.clean_customer(customer) AND pg_temp.clean_customer(customer) <> '';

-- Boshlang'ich qoldiq va shartnomalarda noyoblik indeksi bor: to'qnashsa — o'sha qator o'zgarmaydi
-- (ilovadagi «Birlashtirish» tugmasi bilan qo'lda hal qilinadi).
DO $do$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM finance_customer_openings
            WHERE customer <> pg_temp.clean_customer(customer) AND pg_temp.clean_customer(customer) <> '' LOOP
    BEGIN
      UPDATE finance_customer_openings SET customer = pg_temp.clean_customer(customer) WHERE id = r.id;
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END LOOP;
  FOR r IN SELECT id FROM finance_contracts
            WHERE order_id IS NOT NULL AND counterparty <> pg_temp.clean_customer(counterparty) AND pg_temp.clean_customer(counterparty) <> '' LOOP
    BEGIN
      UPDATE finance_contracts SET counterparty = pg_temp.clean_customer(counterparty) WHERE id = r.id;
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END LOOP;
END $do$;

DROP FUNCTION pg_temp.clean_customer(text);

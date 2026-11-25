-- Telegram ertalabki hisobot: har foydalanuvchiga kuniga bir marta (qayta yuborilmasligi uchun)
CREATE TABLE IF NOT EXISTS telegram_digests (
  user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date     text NOT NULL,
  sent_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

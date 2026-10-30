-- Kunlik reja: kuzatuvchilar uchun ilova va Telegram xabarnomalari.
-- Saqlash bilan xabar/qabul qiluvchilar bitta tranzaksiyada yaratiladi.
CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id  uuid NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
  date        text NOT NULL CHECK (date ~ '^\d{4}-\d{2}-\d{2}$'),
  kind        text NOT NULL DEFAULT 'daily_plan' CHECK (kind = 'daily_plan'),
  payload     jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_created ON notifications (created_at DESC, id DESC);
CREATE INDEX notifications_factory ON notifications (factory_id, created_at DESC);

CREATE TABLE notification_recipients (
  notification_id          uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id                  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at                  timestamptz,
  telegram_sent_at         timestamptz,
  telegram_attempts        int NOT NULL DEFAULT 0 CHECK (telegram_attempts >= 0),
  telegram_error           text,
  telegram_next_attempt_at timestamptz DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);
CREATE INDEX notification_recipients_user ON notification_recipients (user_id, notification_id);
CREATE INDEX notification_recipients_unread ON notification_recipients (user_id) WHERE read_at IS NULL;
CREATE INDEX notification_recipients_telegram ON notification_recipients (telegram_next_attempt_at) WHERE telegram_sent_at IS NULL;

-- Faqat foydalanuvchining o'zi bot orqali bir martalik token bilan ulaydi.
CREATE TABLE telegram_subscriptions (
  user_id   uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  chat_id   text NOT NULL UNIQUE,
  username  text,
  linked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE telegram_link_tokens (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX telegram_link_tokens_expires ON telegram_link_tokens (expires_at);

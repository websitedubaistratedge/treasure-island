-- Treasure Island: admin, boutique, bookings, vouchers, passes and enquiries.
--
-- Money is stored in fils (1 AED = 100 fils) so totals never pick up float
-- error. Timestamps are ISO-8601 UTC; Dubai is UTC+4 all year with no DST,
-- so the app converts at the edges and the database never stores local time.

CREATE TABLE admins (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner','manager','staff')),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iter INTEGER NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Only a SHA-256 of the session token is stored, so a leaked database cannot
-- be replayed as a live login.
CREATE TABLE sessions (
  token_hash   TEXT PRIMARY KEY,
  admin_id     INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  ip           TEXT,
  user_agent   TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at   TEXT NOT NULL
);
CREATE INDEX sessions_admin ON sessions(admin_id);

CREATE TABLE login_attempts (
  id         INTEGER PRIMARY KEY,
  email      TEXT,
  ip         TEXT,
  ok         INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX login_attempts_ip ON login_attempts(ip, created_at);
CREATE INDEX login_attempts_email ON login_attempts(email, created_at);

CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY,
  admin_id   INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  detail     TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX audit_log_created ON audit_log(created_at);

-- Fixed-window counters for the public endpoints (enquiries, voucher lookups,
-- checkout) so they cannot be hammered.
CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,
  count        INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE announcements (
  id         INTEGER PRIMARY KEY,
  message    TEXT NOT NULL,
  link_url   TEXT,
  link_label TEXT,
  tone       TEXT NOT NULL DEFAULT 'gold' CHECK (tone IN ('gold','navy','coral')),
  starts_at  TEXT,
  ends_at    TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Uploaded images live in D1 rather than R2: R2 needs a payment method on the
-- account even on the free tier. The admin resizes to WebP before upload, so
-- rows stay small, and /media/<id> is cached at the edge.
CREATE TABLE media (
  id         TEXT PRIMARY KEY,
  mime       TEXT NOT NULL,
  bytes      BLOB NOT NULL,
  size       INTEGER NOT NULL,
  width      INTEGER,
  height     INTEGER,
  alt        TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE products (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_fils  INTEGER CHECK (price_fils IS NULL OR price_fils >= 0),
  image_id    TEXT REFERENCES media(id) ON DELETE SET NULL,
  image_url   TEXT,
  stock       INTEGER CHECK (stock IS NULL OR stock >= 0),
  active      INTEGER NOT NULL DEFAULT 1,
  featured    INTEGER NOT NULL DEFAULT 1,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Anything a parent can book or buy that is not a shelf product: programmes,
-- camps, parties, workshops, events and multi-visit passes.
CREATE TABLE offerings (
  id            INTEGER PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  kind          TEXT NOT NULL CHECK (kind IN ('program','camp','party','workshop','event','pass')),
  name          TEXT NOT NULL,
  summary       TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  price_fils    INTEGER CHECK (price_fils IS NULL OR price_fils >= 0),
  price_unit    TEXT NOT NULL DEFAULT 'child' CHECK (price_unit IN ('child','booking')),
  deposit_fils  INTEGER CHECK (deposit_fils IS NULL OR deposit_fils >= 0),
  min_age       INTEGER,
  max_age       INTEGER,
  max_children  INTEGER NOT NULL DEFAULT 6 CHECK (max_children > 0),
  visits        INTEGER CHECK (visits IS NULL OR visits > 0),
  validity_days INTEGER CHECK (validity_days IS NULL OR validity_days > 0),
  image_id      TEXT REFERENCES media(id) ON DELETE SET NULL,
  image_url     TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  sort          INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE slots (
  id          INTEGER PRIMARY KEY,
  offering_id INTEGER NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  starts_at   TEXT NOT NULL,
  ends_at     TEXT NOT NULL,
  capacity    INTEGER NOT NULL CHECK (capacity >= 0),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','cancelled')),
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (ends_at > starts_at)
);
CREATE INDEX slots_offering_start ON slots(offering_id, starts_at);
CREATE INDEX slots_start ON slots(starts_at);

CREATE TABLE orders (
  id                    INTEGER PRIMARY KEY,
  ref                   TEXT NOT NULL UNIQUE,
  access_token          TEXT NOT NULL,
  status                TEXT NOT NULL CHECK (status IN ('pending','awaiting_payment','paid','confirmed','completed','cancelled','refunded','expired')),
  channel               TEXT NOT NULL CHECK (channel IN ('online','whatsapp','desk')),
  customer_name         TEXT NOT NULL,
  customer_phone        TEXT NOT NULL,
  customer_email        TEXT,
  notes                 TEXT,
  internal_notes        TEXT,
  subtotal_fils         INTEGER NOT NULL DEFAULT 0,
  discount_fils         INTEGER NOT NULL DEFAULT 0,
  total_fils            INTEGER NOT NULL DEFAULT 0,
  due_now_fils          INTEGER NOT NULL DEFAULT 0,
  paid_fils             INTEGER NOT NULL DEFAULT 0,
  voucher_id            INTEGER REFERENCES vouchers(id) ON DELETE SET NULL,
  payment_method        TEXT CHECK (payment_method IN ('stripe','cash','card','bank','voucher','other')),
  stripe_session_id     TEXT,
  stripe_payment_intent TEXT,
  hold_expires_at       TEXT,
  paid_at               TEXT,
  created_by            INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX orders_status_created ON orders(status, created_at);
CREATE INDEX orders_created ON orders(created_at);
CREATE INDEX orders_phone ON orders(customer_phone);
CREATE INDEX orders_stripe_session ON orders(stripe_session_id);

CREATE TABLE order_items (
  id          INTEGER PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('product','offering','voucher')),
  product_id  INTEGER REFERENCES products(id) ON DELETE SET NULL,
  offering_id INTEGER REFERENCES offerings(id) ON DELETE SET NULL,
  slot_id     INTEGER REFERENCES slots(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  qty         INTEGER NOT NULL CHECK (qty > 0),
  unit_fils   INTEGER,
  line_fils   INTEGER NOT NULL DEFAULT 0,
  meta        TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX order_items_order ON order_items(order_id);
CREATE INDEX order_items_slot ON order_items(slot_id);

CREATE TABLE vouchers (
  id             INTEGER PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  initial_fils   INTEGER NOT NULL CHECK (initial_fils > 0),
  balance_fils   INTEGER NOT NULL CHECK (balance_fils >= 0),
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','redeemed','void','expired')),
  purchaser_name TEXT,
  recipient_name TEXT,
  message        TEXT,
  expires_at     TEXT,
  order_id       INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  created_by     INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (balance_fils <= initial_fils)
);

CREATE TABLE voucher_redemptions (
  id          INTEGER PRIMARY KEY,
  voucher_id  INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  amount_fils INTEGER NOT NULL CHECK (amount_fils > 0),
  order_id    INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  admin_id    INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX voucher_redemptions_voucher ON voucher_redemptions(voucher_id);

CREATE TABLE passes (
  id           INTEGER PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,
  offering_id  INTEGER REFERENCES offerings(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  holder_name  TEXT NOT NULL,
  holder_phone TEXT,
  children     TEXT NOT NULL DEFAULT '[]',
  visits_total INTEGER NOT NULL CHECK (visits_total > 0),
  visits_used  INTEGER NOT NULL DEFAULT 0 CHECK (visits_used >= 0),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','used_up','expired','void')),
  expires_at   TEXT,
  order_id     INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  created_by   INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (visits_used <= visits_total)
);

CREATE TABLE pass_visits (
  id         INTEGER PRIMARY KEY,
  pass_id    INTEGER NOT NULL REFERENCES passes(id) ON DELETE CASCADE,
  admin_id   INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX pass_visits_pass ON pass_visits(pass_id);

CREATE TABLE enquiries (
  id             INTEGER PRIMARY KEY,
  kind           TEXT NOT NULL DEFAULT 'contact' CHECK (kind IN ('contact','birthday','event','other')),
  name           TEXT,
  phone          TEXT,
  email          TEXT,
  message        TEXT,
  payload        TEXT NOT NULL DEFAULT '{}',
  source_page    TEXT,
  status         TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','closed','spam')),
  internal_notes TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX enquiries_status_created ON enquiries(status, created_at);

-- Stripe retries webhooks; recording each event id makes handling idempotent.
CREATE TABLE stripe_events (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO settings (key, value) VALUES
  ('online_booking', '{"enabled":false}'),
  ('payments',       '{"stripe_enabled":false,"hold_minutes":30,"reservation_hold_hours":48}'),
  ('business',       '{"name":"Treasure Island","whatsapp":"971504738452","phone":"+97143827333"}'),
  ('opening_hours',  '{"days":[{"open":"10:00","close":"22:00"},{"open":"10:00","close":"22:00"},{"open":"10:00","close":"22:00"},{"open":"10:00","close":"22:00"},{"open":"10:00","close":"22:00"},{"open":"10:00","close":"22:00"},{"open":"10:00","close":"22:00"}]}'),
  ('closures',       '{"items":[]}'),
  ('notifications',  '{"email":null}');

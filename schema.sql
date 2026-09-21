-- ============================================
-- قاعدة بيانات متجر حجة بتول (PostgreSQL)
-- يُنفَّذ تلقائيًا عند تشغيل السيرفر، ويمكنك تشغيله يدويًا أيضًا
-- ============================================

-- 1) المستخدمون
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(60)  NOT NULL,
  phone         VARCHAR(30)  NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash TEXT         NOT NULL,
  role          VARCHAR(10)  NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 2) المنتجات
--   type      : incense (بخور) أو perfume (عطر)
--   price     : السعر الحالي للعطر (بعد الخصم إن وُجد). فارغ للبخور
--   old_price : السعر قبل الخصم (فارغ إن لا يوجد خصم)
--   images    : مصفوفة روابط الصور للعطر  ["url1","url2"]
--   variants  : أحجام البخور  [{"size":"50 جم","price":40,"old_price":null,"image":"url"}]
CREATE TABLE IF NOT EXISTS products (
  id             SERIAL PRIMARY KEY,
  type           VARCHAR(10)   NOT NULL CHECK (type IN ('incense', 'perfume')),
  name           VARCHAR(150)  NOT NULL,
  price          NUMERIC(10,2),
  old_price      NUMERIC(10,2),
  images         JSONB         NOT NULL DEFAULT '[]'::jsonb,
  variants       JSONB         NOT NULL DEFAULT '[]'::jsonb,
  is_best_seller BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_type ON products (type);
CREATE INDEX IF NOT EXISTS idx_products_best ON products (is_best_seller);

-- 3) الطلبات
--   items : [{"name":"...","quantity":2,"price":40}]
CREATE TABLE IF NOT EXISTS orders (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  customer_name VARCHAR(100)  NOT NULL,
  phone         VARCHAR(30)   NOT NULL,
  items         JSONB         NOT NULL,
  total         NUMERIC(10,2) NOT NULL,
  status        VARCHAR(20)   NOT NULL DEFAULT 'new',
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (created_at DESC);

-- ملاحظة: حساب الأدمن يُنشأ من الكود (src/seed.js) لأن كلمة المرور يجب أن تُشفَّر.

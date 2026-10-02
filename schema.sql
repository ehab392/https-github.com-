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
  out_of_stock   BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_type ON products (type);
CREATE INDEX IF NOT EXISTS idx_products_best ON products (is_best_seller);

-- يضيف هذا العمود تلقائيًا إن كانت قاعدة البيانات منشأة من قبل (قبل إضافة ميزة "نفدت الكمية")
ALTER TABLE products ADD COLUMN IF NOT EXISTS out_of_stock BOOLEAN NOT NULL DEFAULT FALSE;

-- 3) الطلبات
--   items : [{"name":"...","quantity":2,"price":40}]
CREATE TABLE IF NOT EXISTS orders (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  customer_name  VARCHAR(100)  NOT NULL,
  phone          VARCHAR(30)   NOT NULL,
  items          JSONB         NOT NULL,
  subtotal       NUMERIC(10,2),
  delivery_city  VARCHAR(80),
  delivery_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  coupon_code    VARCHAR(40),
  discount       NUMERIC(10,2) NOT NULL DEFAULT 0,
  total          NUMERIC(10,2) NOT NULL,
  status         VARCHAR(20)   NOT NULL DEFAULT 'new',
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders (user_id);

-- يضيف هذه الأعمدة تلقائيًا إن كانت قاعدة البيانات منشأة من قبل
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_city VARCHAR(80);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_price NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(40);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) NOT NULL DEFAULT 0;

-- 4) مناطق التوصيل وأسعارها (يديرها الأدمن)
CREATE TABLE IF NOT EXISTS delivery_zones (
  id         SERIAL PRIMARY KEY,
  city       VARCHAR(80)   NOT NULL,
  price      NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 5) أكواد الخصم (الكوبونات)
--   discount_type: percent (نسبة %) أو fixed (مبلغ ثابت)
CREATE TABLE IF NOT EXISTS coupons (
  id             SERIAL PRIMARY KEY,
  code           VARCHAR(40)   NOT NULL UNIQUE,
  discount_type  VARCHAR(10)   NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value NUMERIC(10,2) NOT NULL,
  min_order      NUMERIC(10,2) NOT NULL DEFAULT 0,
  expires_at     TIMESTAMPTZ,
  active         BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ملاحظة: حساب الأدمن يُنشأ من الكود (src/seed.js) لأن كلمة المرور يجب أن تُشفَّر.

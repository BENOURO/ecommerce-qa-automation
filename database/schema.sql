-- Schema for the e-commerce app under test.
-- Safe to re-run: it drops and recreates everything (test database only!).

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- provides crypt()/gen_salt() for password hashing

DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  full_name     TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id             SERIAL PRIMARY KEY,
  sku            TEXT    NOT NULL UNIQUE,
  name           TEXT    NOT NULL,
  description    TEXT    NOT NULL,
  category       TEXT    NOT NULL,
  -- Money is stored as integer cents: floating point cannot represent 0.10 + 0.20 exactly.
  price_cents    INTEGER NOT NULL CHECK (price_cents >= 0),
  stock_quantity INTEGER NOT NULL CHECK (stock_quantity >= 0)
);

CREATE TABLE orders (
  id                   SERIAL PRIMARY KEY,
  user_id              INTEGER     NOT NULL REFERENCES users (id),
  status               TEXT        NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  total_cents          INTEGER     NOT NULL CHECK (total_cents >= 0),
  shipping_name        TEXT        NOT NULL,
  shipping_email       TEXT        NOT NULL,
  shipping_address     TEXT        NOT NULL,
  shipping_city        TEXT        NOT NULL,
  shipping_postal_code TEXT        NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id               SERIAL PRIMARY KEY,
  order_id         INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_id       INTEGER NOT NULL REFERENCES products (id),
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  -- Price at purchase time, copied from products so later price changes don't rewrite history.
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  UNIQUE (order_id, product_id)
);

CREATE INDEX idx_orders_user_id ON orders (user_id);
CREATE INDEX idx_order_items_order_id ON order_items (order_id);

import { Router, type NextFunction, type Request, type Response } from 'express';
import { getPool, query } from '../../database/connection';
import { hasBug } from '../bugs';
import { HttpError, bodyOf, isEmail, isNonEmptyString, parseId } from '../http';
import { requireAuth } from '../sessions';
import { cartEntries, clearCart } from './cart';

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

interface OrderRow {
  id: number;
  userId: number;
  status: string;
  totalCents: number;
  createdAt: Date;
  shippingName: string;
  shippingEmail: string;
  shippingAddress: string;
  shippingCity: string;
  shippingPostalCode: string;
}

const ORDER_COLUMNS = `
  id, user_id AS "userId", status, total_cents AS "totalCents", created_at AS "createdAt",
  shipping_name AS "shippingName", shipping_email AS "shippingEmail",
  shipping_address AS "shippingAddress", shipping_city AS "shippingCity",
  shipping_postal_code AS "shippingPostalCode"`;

async function orderView(order: OrderRow) {
  const items = await query(
    `SELECT oi.product_id AS "productId", p.sku, p.name, oi.quantity,
            oi.unit_price_cents AS "unitPriceCents",
            oi.quantity * oi.unit_price_cents AS "lineTotalCents"
     FROM order_items oi JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = $1 ORDER BY oi.product_id`,
    [order.id],
  );
  return {
    id: order.id,
    status: order.status,
    totalCents: order.totalCents,
    createdAt: order.createdAt,
    shipping: {
      name: order.shippingName,
      email: order.shippingEmail,
      address: order.shippingAddress,
      city: order.shippingCity,
      postalCode: order.shippingPostalCode,
    },
    items,
  };
}

function validateShipping(shipping: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isNonEmptyString(shipping.name, 100)) errors.name = 'Name is required';
  if (!isEmail(shipping.email)) errors.email = 'A valid email is required';
  if (!isNonEmptyString(shipping.address, 200)) errors.address = 'Address is required';
  if (!isNonEmptyString(shipping.city, 100)) errors.city = 'City is required';
  if (typeof shipping.postalCode !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 -]{2,9}$/.test(shipping.postalCode)) {
    errors.postalCode = 'Postal code must be 3-10 letters, digits, spaces or hyphens';
  }
  return errors;
}

/**
 * A customer can only have one order being placed at a time. Without this, sending the same order
 * twice at once (a double click) would read the same cart twice and create two orders.
 */
const ordersInProgress = new Set<number>();

function oneOrderAtATime(req: Request, res: Response, next: NextFunction): void {
  const userId = req.user!.id;
  if (ordersInProgress.has(userId) && !hasBug('no-order-lock')) {
    res.status(409).json({ error: 'An order is already being placed' });
    return;
  }
  ordersInProgress.add(userId);
  res.on('close', () => ordersInProgress.delete(userId)); // fires when the response is finished
  next();
}

ordersRouter.post('/', oneOrderAtATime, async (req, res) => {
  const userId = req.user!.id;
  // Surrounding spaces are removed BEFORE validating, so " 22202 " is treated like "22202".
  const shipping = Object.fromEntries(
    Object.entries(bodyOf(bodyOf(req.body).shipping)).map(([key, value]) => [
      key,
      typeof value === 'string' ? value.trim() : value,
    ]),
  );
  const errors = validateShipping(shipping);
  if (Object.keys(errors).length > 0) throw new HttpError(400, 'Validation failed', errors);

  const entries = cartEntries(userId);
  if (entries.length === 0) throw new HttpError(400, 'Cart is empty');

  // One transaction: either the order, its items and the stock update all happen, or none do.
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const { rows: products } = await client.query<{
      id: number;
      priceCents: number;
      stockQuantity: number;
    }>(
      `SELECT id, price_cents AS "priceCents", stock_quantity AS "stockQuantity"
       FROM products WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`,
      [entries.map((e) => e.productId)],
    );
    const byId = new Map(products.map((p) => [p.id, p]));

    let totalCents = 0;
    for (const entry of entries) {
      const product = byId.get(entry.productId);
      if (!product) throw new HttpError(409, 'A product in your cart is no longer available');
      if (entry.quantity > product.stockQuantity) throw new HttpError(409, 'Insufficient stock for an item in your cart');
      // SEEDED DEFECT when the bug is on: one unit is charged per product, whatever the quantity.
      totalCents += product.priceCents * (hasBug('order-total-ignores-quantity') ? 1 : entry.quantity);
    }

    const { rows: created } = await client.query<{ id: number }>(
      `INSERT INTO orders (user_id, total_cents, shipping_name, shipping_email,
                           shipping_address, shipping_city, shipping_postal_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        userId,
        totalCents,
        String(shipping.name).trim(),
        String(shipping.email).trim(),
        String(shipping.address).trim(),
        String(shipping.city).trim(),
        String(shipping.postalCode).trim(),
      ],
    );
    const orderId = created[0]!.id;

    for (const entry of entries) {
      const product = byId.get(entry.productId)!;
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents)
         VALUES ($1, $2, $3, $4)`,
        [orderId, entry.productId, entry.quantity, product.priceCents],
      );
      if (!hasBug('stock-not-decreased')) {
        await client.query(
          `UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2`,
          [entry.quantity, entry.productId],
        );
      }
    }
    await client.query('COMMIT');
    clearCart(userId);

    const rows = await query<OrderRow>(`SELECT ${ORDER_COLUMNS} FROM orders WHERE id = $1`, [orderId]);
    res.status(201).json({ order: await orderView(rows[0]!) });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

ordersRouter.get('/', async (req, res) => {
  const rows = await query<OrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM orders WHERE user_id = $1 ORDER BY id DESC`,
    [req.user!.id],
  );
  res.status(200).json({ orders: await Promise.all(rows.map(orderView)) });
});

ordersRouter.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) throw new HttpError(400, 'Order id must be a positive integer');
  const rows = await query<OrderRow>(`SELECT ${ORDER_COLUMNS} FROM orders WHERE id = $1`, [id]);
  const order = rows[0];
  if (!order) throw new HttpError(404, 'Order not found');
  if (order.userId !== req.user!.id && req.user!.role !== 'admin') {
    throw new HttpError(403, 'You do not have access to this order');
  }
  res.status(200).json({ order: await orderView(order) });
});

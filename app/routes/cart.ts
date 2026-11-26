import { Router } from 'express';
import { query } from '../../database/connection';
import { hasBug } from '../bugs';
import { HttpError, bodyOf, isQuantity, parseId } from '../http';
import { requireAuth } from '../sessions';

export const cartRouter = Router();
cartRouter.use(requireAuth);

/** In-memory carts: userId -> (productId -> quantity). Carts survive page refresh and re-login. */
const carts = new Map<number, Map<number, number>>();

function cartOf(userId: number): Map<number, number> {
  let cart = carts.get(userId);
  if (!cart) {
    cart = new Map();
    carts.set(userId, cart);
  }
  return cart;
}

export function cartEntries(userId: number): Array<{ productId: number; quantity: number }> {
  return [...cartOf(userId).entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

export function clearCart(userId: number): void {
  carts.delete(userId);
}

interface ProductRow {
  id: number;
  sku: string;
  name: string;
  priceCents: number;
  stockQuantity: number;
}

async function findProduct(id: number): Promise<ProductRow> {
  const rows = await query<ProductRow>(
    `SELECT id, sku, name, price_cents AS "priceCents", stock_quantity AS "stockQuantity"
     FROM products WHERE id = $1`,
    [id],
  );
  if (!rows[0]) throw new HttpError(404, 'Product not found');
  return rows[0];
}

async function cartView(userId: number) {
  const entries = cartEntries(userId);
  const products = entries.length
    ? await query<ProductRow>(
        `SELECT id, sku, name, price_cents AS "priceCents", stock_quantity AS "stockQuantity"
         FROM products WHERE id = ANY($1::int[]) ORDER BY id`,
        [entries.map((e) => e.productId)],
      )
    : [];
  const items = products.map((p) => {
    const quantity = cartOf(userId).get(p.id) ?? 0;
    return {
      productId: p.id,
      sku: p.sku,
      name: p.name,
      unitPriceCents: p.priceCents,
      quantity,
      lineTotalCents: p.priceCents * quantity,
    };
  });
  // SEEDED DEFECT when the bug is on: the total adds one unit price per product and ignores quantities.
  const totalCents = hasBug('wrong-cart-total')
    ? items.reduce((sum, i) => sum + i.unitPriceCents, 0)
    : items.reduce((sum, i) => sum + i.lineTotalCents, 0);
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  return { items, itemCount, totalCents };
}

cartRouter.get('/', async (req, res) => {
  res.status(200).json({ cart: await cartView(req.user!.id) });
});

cartRouter.post('/items', async (req, res) => {
  const body = bodyOf(req.body);
  const productId = typeof body.productId === 'number' ? body.productId : NaN;
  if (!Number.isInteger(productId) || productId < 1) throw new HttpError(400, 'productId must be a positive integer');
  if (!isQuantity(body.quantity)) throw new HttpError(400, 'quantity must be an integer between 1 and 99');

  const product = await findProduct(productId);
  if (product.stockQuantity === 0) throw new HttpError(409, 'Product is out of stock');
  const cart = cartOf(req.user!.id);
  const newQuantity = (cart.get(productId) ?? 0) + body.quantity;
  if (newQuantity > product.stockQuantity && !hasBug('oversell-in-cart')) {
    throw new HttpError(409, `Only ${product.stockQuantity} units available`);
  }
  cart.set(productId, newQuantity);
  res.status(200).json({ cart: await cartView(req.user!.id) });
});

cartRouter.patch('/items/:productId', async (req, res) => {
  const productId = parseId(req.params.productId);
  if (productId === null) throw new HttpError(400, 'Product id must be a positive integer');
  const body = bodyOf(req.body);
  if (!isQuantity(body.quantity)) throw new HttpError(400, 'quantity must be an integer between 1 and 99');

  const cart = cartOf(req.user!.id);
  if (!cart.has(productId)) throw new HttpError(404, 'Product is not in the cart');
  const product = await findProduct(productId);
  if (body.quantity > product.stockQuantity && !hasBug('oversell-in-cart')) {
    throw new HttpError(409, `Only ${product.stockQuantity} units available`);
  }
  cart.set(productId, body.quantity);
  res.status(200).json({ cart: await cartView(req.user!.id) });
});

cartRouter.delete('/items/:productId', async (req, res) => {
  const productId = parseId(req.params.productId);
  if (productId === null) throw new HttpError(400, 'Product id must be a positive integer');
  const cart = cartOf(req.user!.id);
  if (!cart.delete(productId)) throw new HttpError(404, 'Product is not in the cart');
  res.status(200).json({ cart: await cartView(req.user!.id) });
});

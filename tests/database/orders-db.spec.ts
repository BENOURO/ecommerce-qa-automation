import { test, expect } from '../../fixtures/test-fixtures';
import { query } from '../../database/connection';
import {
  countOrdersForUser,
  deleteUserAndOrders,
  findOrderById,
  findUserById,
  listOrderItems,
  listOrdersForUser,
  sumOfOrderItems,
} from '../../database/queries';
import { rollbackOnly } from '../../database/transaction';
import { expectedTotalCents, productBySku } from '../../utils/catalog';
import { addToCart, placeOrder, productIdOf, type ApiOrder } from '../../utils/api-helpers';
import { buildShipping } from '../../utils/test-data';

// Products with plenty of stock. The Wool Beanie and the Denim Jacket are reserved for other tests.
const mouse = productBySku('ELEC-001');
const book = productBySku('BOOK-001');
const tshirt = productBySku('CLTH-001');
const socks = productBySku('CLTH-003');

test.describe('Orders and order items: what an order saves', () => {
  test('DB-ORD-001: an order is saved with its owner, status, total and trimmed shipping details', async ({
    authenticatedRequest,
    testUser,
  }) => {
    await addToCart(authenticatedRequest, mouse.sku, 2);
    const shipping = buildShipping({ name: '  Katherine Johnson ', city: 'Hampton', postalCode: ' 23669' });

    const order = await placeOrder(authenticatedRequest, shipping);

    const row = await findOrderById(order.id);
    expect(row).toMatchObject({
      id: order.id,
      user_id: testUser.id,
      status: 'confirmed',
      total_cents: mouse.priceCents * 2,
      shipping_name: 'Katherine Johnson',
      shipping_email: shipping.email,
      shipping_address: shipping.address,
      shipping_city: 'Hampton',
      shipping_postal_code: '23669',
    });
    const [recent] = await query<{ recent: boolean }>(
      `SELECT now() - created_at < interval '1 minute' AS recent FROM orders WHERE id = $1`,
      [order.id],
    );
    expect(recent!.recent).toBe(true);
  });

  test('DB-ORD-002: every ordered product becomes one order item with the right quantity and price', async ({
    authenticatedRequest,
  }) => {
    const lines = [
      { product: mouse, quantity: 2 },
      { product: book, quantity: 1 },
      { product: socks, quantity: 3 },
    ];
    for (const line of lines) await addToCart(authenticatedRequest, line.product.sku, line.quantity);

    const order = await placeOrder(authenticatedRequest);

    const expected = await Promise.all(
      lines.map(async (line) => ({
        product_id: await productIdOf(line.product.sku),
        quantity: line.quantity,
        unit_price_cents: line.product.priceCents,
      })),
    );
    expected.sort((a, b) => a.product_id - b.product_id); // the query below is ordered by product id
    const items = await listOrderItems(order.id);
    expect(items.map(({ product_id, quantity, unit_price_cents }) => ({ product_id, quantity, unit_price_cents }))).toEqual(
      expected,
    );
  });

  test('DB-ORD-003: the order total equals the sum of its items, as computed by the database', async ({
    authenticatedRequest,
  }) => {
    await addToCart(authenticatedRequest, mouse.sku, 3);
    await addToCart(authenticatedRequest, tshirt.sku, 4);

    const order = await placeOrder(authenticatedRequest);

    const row = await findOrderById(order.id);
    expect(await sumOfOrderItems(order.id)).toBe(row!.total_cents);
    expect(row!.total_cents).toBe(
      expectedTotalCents([{ sku: mouse.sku, quantity: 3 }, { sku: tshirt.sku, quantity: 4 }]),
    );
  });

  test('DB-ORD-004: an order item keeps its own copy of the price, so a later price change does not rewrite it', async ({
    authenticatedRequest,
  }) => {
    await addToCart(authenticatedRequest, book.sku, 2);
    const order = await placeOrder(authenticatedRequest);
    const id = await productIdOf(book.sku);

    // The price change happens inside a transaction that is rolled back, so no other test ever sees it.
    await rollbackOnly(async (client) => {
      await client.query('UPDATE products SET price_cents = price_cents + 5000 WHERE id = $1', [id]);
      const { rows } = await client.query<{ unit_price_cents: number }>(
        'SELECT unit_price_cents FROM order_items WHERE order_id = $1 AND product_id = $2',
        [order.id, id],
      );
      expect(rows[0]!.unit_price_cents).toBe(book.priceCents); // unchanged
      const product = await client.query<{ price_cents: number }>('SELECT price_cents FROM products WHERE id = $1', [id]);
      expect(product.rows[0]!.price_cents).toBe(book.priceCents + 5000); // while the product itself did change
    });
  });

  test('DB-ORD-005: each order joins back to the right customer', async ({ authenticatedRequest, testUser }) => {
    await addToCart(authenticatedRequest, socks.sku, 1);
    const order = await placeOrder(authenticatedRequest);

    const [owner] = await query<{ email: string; full_name: string }>(
      'SELECT u.email, u.full_name FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = $1',
      [order.id],
    );

    expect(owner).toEqual({ email: testUser.email, full_name: testUser.fullName });
  });

  test('DB-ORD-006: two orders by the same customer are stored separately, each with its own items', async ({
    authenticatedRequest,
    testUser,
  }) => {
    await addToCart(authenticatedRequest, mouse.sku, 1);
    const first = await placeOrder(authenticatedRequest);
    await addToCart(authenticatedRequest, book.sku, 2);
    const second = await placeOrder(authenticatedRequest);

    const orders = await listOrdersForUser(testUser.id);
    expect(orders.map((o) => o.id)).toEqual([first.id, second.id]);
    expect(orders.map((o) => o.total_cents)).toEqual([mouse.priceCents, book.priceCents * 2]);
    expect(await listOrderItems(first.id)).toHaveLength(1);
    expect(await listOrderItems(second.id)).toHaveLength(1);
  });

  test('DB-ORD-007: orders that are refused leave no trace in the database', async ({
    authenticatedRequest,
    testUser,
  }) => {
    // 1) empty cart  2) invalid shipping with a full cart
    await authenticatedRequest.post('/api/orders', { data: { shipping: buildShipping() } });
    await addToCart(authenticatedRequest, mouse.sku, 1);
    await authenticatedRequest.post('/api/orders', { data: { shipping: buildShipping({ postalCode: '!' }) } });

    expect(await countOrdersForUser(testUser.id)).toBe(0);
    const [items] = await query<{ count: number }>(
      `SELECT count(*)::int AS count FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.user_id = $1`,
      [testUser.id],
    );
    expect(items!.count).toBe(0);
  });
});

test.describe('Orders and order items: rules enforced by the database itself', () => {
  async function orderWithOneItem(request: Parameters<typeof placeOrder>[0]): Promise<ApiOrder> {
    await addToCart(request, mouse.sku, 1);
    return placeOrder(request);
  }

  test('DB-ORD-010: deleting an order also deletes its items (cascade)', async ({ authenticatedRequest }) => {
    const order = await orderWithOneItem(authenticatedRequest);

    await rollbackOnly(async (client) => {
      await client.query('DELETE FROM orders WHERE id = $1', [order.id]);
      const { rows } = await client.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM order_items WHERE order_id = $1',
        [order.id],
      );
      expect(rows[0]!.count).toBe(0);
    });
    expect(await listOrderItems(order.id)).toHaveLength(1); // the delete was rolled back
  });

  const insertItem = 'INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents) VALUES ($1, $2, $3, $4)';

  test('DB-ORD-011: an order item needs a quantity above zero (check violation 23514)', async ({
    authenticatedRequest,
  }) => {
    const order = await orderWithOneItem(authenticatedRequest);
    const otherProduct = await productIdOf(book.sku);

    await rollbackOnly(async (client) => {
      await expect(client.query(insertItem, [order.id, otherProduct, 0, 100])).rejects.toMatchObject({ code: '23514' });
    });
  });

  test('DB-ORD-012: the same product cannot appear twice in one order (unique violation 23505)', async ({
    authenticatedRequest,
  }) => {
    const order = await orderWithOneItem(authenticatedRequest);

    await rollbackOnly(async (client) => {
      await expect(client.query(insertItem, [order.id, await productIdOf(mouse.sku), 1, 100])).rejects.toMatchObject({
        code: '23505',
      });
    });
  });

  test('DB-ORD-013: an order item must refer to an existing order (foreign key violation 23503)', async () => {
    await rollbackOnly(async (client) => {
      await expect(client.query(insertItem, [2_000_000_000, await productIdOf(mouse.sku), 1, 100])).rejects.toMatchObject({
        code: '23503',
      });
    });
  });

  test('DB-ORD-014: an order item must refer to an existing product (foreign key violation 23503)', async ({
    authenticatedRequest,
  }) => {
    const order = await orderWithOneItem(authenticatedRequest);

    await rollbackOnly(async (client) => {
      await expect(client.query(insertItem, [order.id, 2_000_000_000, 1, 100])).rejects.toMatchObject({ code: '23503' });
    });
  });

  test('DB-ORD-015: an order must belong to an existing user (foreign key violation 23503)', async () => {
    await rollbackOnly(async (client) => {
      await expect(
        client.query(
          `INSERT INTO orders (user_id, total_cents, shipping_name, shipping_email, shipping_address, shipping_city, shipping_postal_code)
           VALUES ($1, 100, 'n', 'e@example.test', 'a', 'c', '12345')`,
          [2_000_000_000],
        ),
      ).rejects.toMatchObject({ code: '23503' });
    });
  });

  for (const [field, status, total] of [
    ['status', 'refunded', 100],
    ['total_cents', 'confirmed', -1],
  ] as const) {
    test(`DB-ORD-016: an invalid ${field} is refused (check violation 23514)`, async ({ testUser }) => {
      await rollbackOnly(async (client) => {
        await expect(
          client.query(
            `INSERT INTO orders (user_id, status, total_cents, shipping_name, shipping_email, shipping_address, shipping_city, shipping_postal_code)
             VALUES ($1, $2, $3, 'n', 'e@example.test', 'a', 'c', '12345')`,
            [testUser.id, status, total],
          ),
        ).rejects.toMatchObject({ code: '23514' });
      });
    });
  }
});

test.describe('Orders: API and database agree', () => {
  test('DB-ORD-020: the order the API returns is exactly what the database holds', async ({ authenticatedRequest }) => {
    await addToCart(authenticatedRequest, mouse.sku, 2);
    await addToCart(authenticatedRequest, book.sku, 1);
    const created = await placeOrder(authenticatedRequest);

    const apiOrder = ((await (await authenticatedRequest.get(`/api/orders/${created.id}`)).json()) as { order: ApiOrder }).order;

    const row = (await findOrderById(created.id))!;
    const items = await query<{ sku: string; name: string; quantity: number; unit_price_cents: number }>(
      `SELECT p.sku, p.name, oi.quantity, oi.unit_price_cents
         FROM order_items oi JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = $1 ORDER BY oi.product_id`,
      [created.id],
    );
    expect(apiOrder.id).toBe(row.id);
    expect(apiOrder.status).toBe(row.status);
    expect(apiOrder.totalCents).toBe(row.total_cents);
    expect(apiOrder.shipping).toEqual({
      name: row.shipping_name,
      email: row.shipping_email,
      address: row.shipping_address,
      city: row.shipping_city,
      postalCode: row.shipping_postal_code,
    });
    expect(apiOrder.items.map((i) => ({ sku: i.sku, name: i.name, quantity: i.quantity, unit_price_cents: i.unitPriceCents })))
      .toEqual(items);
  });

  test('DB-ORD-021: the customer\'s order list in the API has the same orders as the database', async ({
    authenticatedRequest,
    testUser,
  }) => {
    await addToCart(authenticatedRequest, socks.sku, 1);
    await placeOrder(authenticatedRequest);
    await addToCart(authenticatedRequest, tshirt.sku, 2);
    await placeOrder(authenticatedRequest);

    const { orders } = (await (await authenticatedRequest.get('/api/orders')).json()) as { orders: ApiOrder[] };

    const rows = await listOrdersForUser(testUser.id);
    expect(orders.map((o) => o.id).sort()).toEqual(rows.map((o) => o.id).sort());
    expect(orders.map((o) => o.totalCents).sort()).toEqual(rows.map((o) => o.total_cents).sort());
  });
});

test.describe('Test data cleanup', () => {
  test('DB-ORD-030: removing a test user also removes their orders and items', async ({ authenticatedRequest, testUser }) => {
    await addToCart(authenticatedRequest, mouse.sku, 1);
    const order = await placeOrder(authenticatedRequest);

    await deleteUserAndOrders(testUser.id);

    expect(await findUserById(testUser.id)).toBeUndefined();
    expect(await findOrderById(order.id)).toBeUndefined();
    expect(await listOrderItems(order.id)).toEqual([]);
  });
});

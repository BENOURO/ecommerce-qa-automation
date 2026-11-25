import type { APIResponse } from '@playwright/test';
import { test, expect } from '../../fixtures/test-fixtures';
import { countOrdersForUser } from '../../database/queries';
import { expectedTotalCents, productBySku } from '../../utils/catalog';
import { addToCart, getCart, productIdOf, type ApiOrder } from '../../utils/api-helpers';
import { buildNewUser, buildShipping, type ShippingDetails } from '../../utils/test-data';

const mouse = productBySku('ELEC-001');
const book = productBySku('BOOK-001');
const tshirt = productBySku('CLTH-001');

const orderOf = async (response: APIResponse): Promise<ApiOrder> =>
  ((await response.json()) as { order: ApiOrder }).order;

test.describe('Checkout API: placing orders', () => {
  test('CHK-API-001: placing an order requires a login (401)', async ({ request }) => {
    const response = await request.post('/api/orders', { data: { shipping: buildShipping() } });

    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: 'Authentication required' });
  });

  test('CHK-API-002: a valid order returns 201 with the documented order, items and shipping', async ({
    authenticatedRequest,
  }) => {
    const shipping = buildShipping();
    await addToCart(authenticatedRequest, mouse.sku, 2);
    await addToCart(authenticatedRequest, book.sku, 1);

    const response = await authenticatedRequest.post('/api/orders', { data: { shipping } });

    expect(response.status()).toBe(201);
    const order = await orderOf(response);
    expect(order).toEqual({
      id: expect.any(Number),
      status: 'confirmed',
      totalCents: expectedTotalCents([{ sku: mouse.sku, quantity: 2 }, { sku: book.sku, quantity: 1 }]),
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      shipping,
      items: [
        {
          productId: await productIdOf(mouse.sku),
          sku: mouse.sku,
          name: mouse.name,
          quantity: 2,
          unitPriceCents: mouse.priceCents,
          lineTotalCents: mouse.priceCents * 2,
        },
        {
          productId: await productIdOf(book.sku),
          sku: book.sku,
          name: book.name,
          quantity: 1,
          unitPriceCents: book.priceCents,
          lineTotalCents: book.priceCents,
        },
      ],
    });
  });

  test('CHK-API-003: the order total equals the sum of its line totals', async ({ authenticatedRequest }) => {
    await addToCart(authenticatedRequest, mouse.sku, 3);
    await addToCart(authenticatedRequest, tshirt.sku, 4);

    const order = await orderOf(
      await authenticatedRequest.post('/api/orders', { data: { shipping: buildShipping() } }),
    );

    expect(order.totalCents).toBe(order.items.reduce((sum, item) => sum + item.lineTotalCents, 0));
    expect(order.totalCents).toBe(mouse.priceCents * 3 + tshirt.priceCents * 4);
  });

  test('CHK-API-004: a successful order empties the cart', async ({ authenticatedRequest }) => {
    await addToCart(authenticatedRequest, mouse.sku, 1);

    await authenticatedRequest.post('/api/orders', { data: { shipping: buildShipping() } });

    expect(await getCart(authenticatedRequest)).toEqual({ items: [], itemCount: 0, totalCents: 0 });
  });

  test('CHK-API-005: shipping details are saved trimmed', async ({ authenticatedRequest }) => {
    await addToCart(authenticatedRequest, mouse.sku, 1);

    const order = await orderOf(
      await authenticatedRequest.post('/api/orders', {
        data: { shipping: buildShipping({ name: '  Grace Hopper  ', city: ' Arlington ', postalCode: ' 22202 ' }) },
      }),
    );

    expect(order.shipping.name).toBe('Grace Hopper');
    expect(order.shipping.city).toBe('Arlington');
    expect(order.shipping.postalCode).toBe('22202');
  });

  test('CHK-API-006: the order can be read back and appears in the order list', async ({ authenticatedRequest }) => {
    await addToCart(authenticatedRequest, book.sku, 1);
    const created = await orderOf(
      await authenticatedRequest.post('/api/orders', { data: { shipping: buildShipping() } }),
    );

    const single = await authenticatedRequest.get(`/api/orders/${created.id}`);
    const list = await authenticatedRequest.get('/api/orders');

    expect(single.status()).toBe(200);
    expect((await orderOf(single)).totalCents).toBe(created.totalCents);
    const orders = ((await list.json()) as { orders: ApiOrder[] }).orders;
    expect(orders.map((o) => o.id)).toEqual([created.id]);
  });

  test('CHK-API-007: the price on the order does not change when the cart price source changes later', async ({
    authenticatedRequest,
  }) => {
    await addToCart(authenticatedRequest, book.sku, 2);

    const order = await orderOf(
      await authenticatedRequest.post('/api/orders', { data: { shipping: buildShipping() } }),
    );

    expect(order.items[0]!.unitPriceCents).toBe(book.priceCents);
    expect(order.items[0]!.lineTotalCents).toBe(book.priceCents * 2);
  });
});

test.describe('Checkout API: refusing bad orders', () => {
  test('CHK-API-010: an empty cart cannot be ordered (400)', async ({ authenticatedRequest, testUser }) => {
    const response = await authenticatedRequest.post('/api/orders', { data: { shipping: buildShipping() } });

    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ error: 'Cart is empty' });
    expect(await countOrdersForUser(testUser.id)).toBe(0);
  });

  test('CHK-API-011: empty shipping details return 400 with an error for each of the five fields', async ({
    authenticatedRequest,
  }) => {
    await addToCart(authenticatedRequest, mouse.sku, 1);

    const response = await authenticatedRequest.post('/api/orders', { data: { shipping: {} } });

    expect(response.status()).toBe(400);
    const body = (await response.json()) as { error: string; details: Record<string, string> };
    expect(body.error).toBe('Validation failed');
    expect(Object.keys(body.details).sort()).toEqual(['address', 'city', 'email', 'name', 'postalCode']);
  });

  test('CHK-API-012: a body without shipping at all returns 400', async ({ authenticatedRequest }) => {
    await addToCart(authenticatedRequest, mouse.sku, 1);

    for (const data of [{}, { shipping: null }, { shipping: 'Test Buyer' }, { shipping: [] }]) {
      const response = await authenticatedRequest.post('/api/orders', { data });
      expect(response.status(), JSON.stringify(data)).toBe(400);
    }
  });

  const invalidFields: Array<[keyof ShippingDetails, unknown, string]> = [
    ['name', '', 'blank'],
    ['name', '   ', 'only spaces'],
    ['name', 'x'.repeat(101), 'longer than 100 characters'],
    ['name', 42, 'a number'],
    ['email', 'not-an-email', 'not an email'],
    ['email', 'a@b', 'missing a domain extension'],
    ['email', null, 'null'],
    ['address', '', 'blank'],
    ['address', 'x'.repeat(201), 'longer than 200 characters'],
    ['city', '', 'blank'],
    ['city', ['Paris'], 'an array'],
    ['postalCode', '12', 'too short'],
    ['postalCode', '12345678901', 'too long'],
    ['postalCode', '12#45', 'containing a symbol'],
    ['postalCode', 12345, 'a number instead of text'],
  ];
  for (const [field, value, why] of invalidFields) {
    test(`CHK-API-013: ${field} ${why} is rejected and only ${field} is reported`, async ({
      authenticatedRequest,
      testUser,
    }) => {
      await addToCart(authenticatedRequest, mouse.sku, 1);

      const response = await authenticatedRequest.post('/api/orders', {
        data: { shipping: { ...buildShipping(), [field]: value } },
      });

      expect(response.status()).toBe(400);
      expect(Object.keys(((await response.json()) as { details: object }).details)).toEqual([field]);
      expect(await countOrdersForUser(testUser.id)).toBe(0);
      expect((await getCart(authenticatedRequest)).itemCount).toBe(1); // the cart is kept
    });
  }

  test('CHK-API-014: the total cannot be chosen by the client', async ({ authenticatedRequest }) => {
    await addToCart(authenticatedRequest, mouse.sku, 1);

    const order = await orderOf(
      await authenticatedRequest.post('/api/orders', {
        data: { shipping: buildShipping(), totalCents: 1, items: [{ productId: 1, quantity: 99 }] },
      }),
    );

    expect(order.totalCents).toBe(mouse.priceCents);
    expect(order.items).toHaveLength(1);
    expect(order.items[0]!.quantity).toBe(1);
  });
});

test.describe('Checkout API: access to orders', () => {
  test('CHK-API-020: reading orders requires a login (401)', async ({ request }) => {
    expect((await request.get('/api/orders')).status()).toBe(401);
    expect((await request.get('/api/orders/1')).status()).toBe(401);
  });

  test('CHK-API-021: another customer cannot read my order (403), and my list never shows it', async ({
    authenticatedRequest,
    playwright,
    baseURL,
    trackUser,
  }) => {
    await addToCart(authenticatedRequest, mouse.sku, 1);
    const mine = await orderOf(
      await authenticatedRequest.post('/api/orders', { data: { shipping: buildShipping() } }),
    );

    const other = await playwright.request.newContext({ baseURL });
    const otherUser = buildNewUser();
    trackUser(otherUser.email);
    await other.post('/api/auth/register', { data: otherUser });
    await other.post('/api/auth/login', { data: otherUser });

    const forbidden = await other.get(`/api/orders/${mine.id}`);
    const theirList = await other.get('/api/orders');

    expect(forbidden.status()).toBe(403);
    expect(await forbidden.json()).toEqual({ error: 'You do not have access to this order' });
    expect(((await theirList.json()) as { orders: unknown[] }).orders).toEqual([]);
    await other.dispose();
  });

  test('CHK-API-022: an administrator can read any customer\'s order', async ({
    authenticatedRequest,
    playwright,
    baseURL,
  }) => {
    await addToCart(authenticatedRequest, book.sku, 1);
    const mine = await orderOf(
      await authenticatedRequest.post('/api/orders', { data: { shipping: buildShipping() } }),
    );
    const { env } = await import('../../utils/env');
    const admin = await playwright.request.newContext({ baseURL });
    await admin.post('/api/auth/login', { data: { email: env.adminEmail, password: env.testUser.password } });

    const response = await admin.get(`/api/orders/${mine.id}`);

    expect(response.status()).toBe(200);
    expect((await orderOf(response)).id).toBe(mine.id);
    await admin.dispose();
  });

  test('CHK-API-023: unknown or invalid order ids return 404 or 400', async ({ authenticatedRequest }) => {
    expect((await authenticatedRequest.get('/api/orders/999999999')).status()).toBe(404);
    for (const id of ['abc', '0', '-1', '1.5']) {
      expect((await authenticatedRequest.get(`/api/orders/${id}`)).status(), id).toBe(400);
    }
  });
});

test.describe('Checkout API: concurrency', () => {
  test('CHK-API-030: sending the same order twice at once creates only one order', async ({
    authenticatedRequest,
    testUser,
  }) => {
    await addToCart(authenticatedRequest, tshirt.sku, 1);
    const send = () => authenticatedRequest.post('/api/orders', { data: { shipping: buildShipping() } });

    const responses = await Promise.all([send(), send()]);

    const statuses = responses.map((r) => r.status()).sort();
    expect(statuses.filter((s) => s === 201), `statuses were ${statuses.join(', ')}`).toHaveLength(1);
    expect(await countOrdersForUser(testUser.id)).toBe(1);
  });
});

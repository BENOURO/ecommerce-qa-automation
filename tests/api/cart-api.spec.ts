import { test, expect } from '../../fixtures/test-fixtures';
import { LIMITED_STOCK_SKU, expectedTotalCents, productBySku } from '../../utils/catalog';
import { addToCart, getCart, productIdOf, type ApiCart } from '../../utils/api-helpers';
import { buildNewUser } from '../../utils/test-data';

const mouse = productBySku('ELEC-001');
const book = productBySku('BOOK-001');
const socks = productBySku('CLTH-003');
const beanie = productBySku(LIMITED_STOCK_SKU); // stock 5, reserved for limit tests
const headphones = productBySku('ELEC-004'); // out of stock

async function cartBody(response: import('@playwright/test').APIResponse): Promise<ApiCart> {
  return ((await response.json()) as { cart: ApiCart }).cart;
}

test.describe('Cart API: access', () => {
  test('CART-API-001: every cart endpoint requires a login (401)', async ({ request }) => {
    const calls = [
      await request.get('/api/cart'),
      await request.post('/api/cart/items', { data: { productId: 1, quantity: 1 } }),
      await request.patch('/api/cart/items/1', { data: { quantity: 1 } }),
      await request.delete('/api/cart/items/1'),
    ];

    for (const response of calls) {
      expect(response.status()).toBe(401);
      expect(await response.json()).toEqual({ error: 'Authentication required' });
    }
  });

  test('CART-API-002: a new user has an empty cart', async ({ authenticatedRequest }) => {
    const response = await authenticatedRequest.get('/api/cart');

    expect(response.status()).toBe(200);
    expect(await cartBody(response)).toEqual({ items: [], itemCount: 0, totalCents: 0 });
  });

  test('CART-API-003: carts are private: another user never sees my items', async ({
    authenticatedRequest,
    playwright,
    baseURL,
    trackUser,
  }) => {
    await addToCart(authenticatedRequest, mouse.sku, 2);

    const other = await playwright.request.newContext({ baseURL });
    const data = buildNewUser(); // a second, unrelated user
    trackUser(data.email);
    expect((await other.post('/api/auth/register', { data })).status()).toBe(201);
    expect((await other.post('/api/auth/login', { data })).status()).toBe(200);

    expect(await getCart(other)).toEqual({ items: [], itemCount: 0, totalCents: 0 });
    expect((await getCart(authenticatedRequest)).itemCount).toBe(2);
    await other.dispose();
  });
});

test.describe('Cart API: adding products', () => {
  test('CART-API-010: adding a product returns 200 and the cart with the documented fields', async ({
    authenticatedRequest,
  }) => {
    const response = await addToCart(authenticatedRequest, mouse.sku, 2);

    expect(response.status()).toBe(200);
    expect(await cartBody(response)).toEqual({
      items: [
        {
          productId: await productIdOf(mouse.sku),
          sku: mouse.sku,
          name: mouse.name,
          unitPriceCents: mouse.priceCents,
          quantity: 2,
          lineTotalCents: mouse.priceCents * 2,
        },
      ],
      itemCount: 2,
      totalCents: mouse.priceCents * 2,
    });
  });

  test('CART-API-011: adding the same product again adds up the quantities', async ({ authenticatedRequest }) => {
    await addToCart(authenticatedRequest, mouse.sku, 1);
    const response = await addToCart(authenticatedRequest, mouse.sku, 2);

    const cart = await cartBody(response);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]!.quantity).toBe(3);
  });

  test('CART-API-012: totals and item count are calculated correctly for several products', async ({
    authenticatedRequest,
  }) => {
    await addToCart(authenticatedRequest, mouse.sku, 2);
    await addToCart(authenticatedRequest, book.sku, 3);
    await addToCart(authenticatedRequest, socks.sku, 1);

    const cart = await getCart(authenticatedRequest);

    expect(cart.items).toHaveLength(3);
    expect(cart.itemCount).toBe(6);
    expect(cart.totalCents).toBe(
      expectedTotalCents([
        { sku: mouse.sku, quantity: 2 },
        { sku: book.sku, quantity: 3 },
        { sku: socks.sku, quantity: 1 },
      ]),
    );
    for (const item of cart.items) {
      expect(item.lineTotalCents).toBe(item.unitPriceCents * item.quantity);
    }
  });

  test('CART-API-013: the cart uses the current catalog price', async ({ authenticatedRequest }) => {
    const id = await productIdOf(book.sku);
    await addToCart(authenticatedRequest, book.sku, 1);

    const catalog = (await (await authenticatedRequest.get(`/api/products/${id}`)).json()) as {
      product: { priceCents: number };
    };
    const cart = await getCart(authenticatedRequest);

    expect(cart.items[0]!.unitPriceCents).toBe(catalog.product.priceCents);
  });

  const invalidAdds: Array<[string, Record<string, unknown>]> = [
    ['a missing product id', { quantity: 1 }],
    ['a product id that is not a number', { productId: '1', quantity: 1 }],
    ['product id 0', { productId: 0, quantity: 1 }],
    ['a decimal product id', { productId: 1.5, quantity: 1 }],
    ['a missing quantity', { productId: 1 }],
    ['quantity 0', { productId: 1, quantity: 0 }],
    ['a negative quantity', { productId: 1, quantity: -1 }],
    ['quantity 100 (above the maximum of 99)', { productId: 1, quantity: 100 }],
    ['a decimal quantity', { productId: 1, quantity: 1.5 }],
    ['a quantity sent as text', { productId: 1, quantity: '2' }],
  ];
  for (const [name, data] of invalidAdds) {
    test(`CART-API-014: adding with ${name} returns 400 and changes nothing`, async ({ authenticatedRequest }) => {
      const response = await authenticatedRequest.post('/api/cart/items', { data });

      expect(response.status()).toBe(400);
      expect(((await response.json()) as { error: string }).error).toMatch(/must be/);
      expect((await getCart(authenticatedRequest)).items).toEqual([]);
    });
  }

  test('CART-API-015: adding a product that does not exist returns 404', async ({ authenticatedRequest }) => {
    const response = await authenticatedRequest.post('/api/cart/items', { data: { productId: 999999, quantity: 1 } });

    expect(response.status()).toBe(404);
    expect(await response.json()).toEqual({ error: 'Product not found' });
  });

  test('CART-API-016: an out-of-stock product cannot be added (409)', async ({ authenticatedRequest }) => {
    const response = await addToCart(authenticatedRequest, headphones.sku, 1);

    expect(response.status()).toBe(409);
    expect(await response.json()).toEqual({ error: 'Product is out of stock' });
    expect((await getCart(authenticatedRequest)).items).toEqual([]);
  });

  test('CART-API-017: the cart can hold exactly the available stock but not one unit more', async ({
    authenticatedRequest,
  }) => {
    const allStock = await addToCart(authenticatedRequest, beanie.sku, beanie.stockQuantity);
    expect(allStock.status()).toBe(200);

    const oneMore = await addToCart(authenticatedRequest, beanie.sku, 1);

    expect(oneMore.status()).toBe(409);
    expect(await oneMore.json()).toEqual({ error: `Only ${beanie.stockQuantity} units available` });
    expect((await getCart(authenticatedRequest)).itemCount).toBe(beanie.stockQuantity);
  });
});

test.describe('Cart API: changing and removing', () => {
  test('CART-API-020: updating sets the quantity (it does not add to it)', async ({ authenticatedRequest }) => {
    await addToCart(authenticatedRequest, mouse.sku, 2);
    const id = await productIdOf(mouse.sku);

    const response = await authenticatedRequest.patch(`/api/cart/items/${id}`, { data: { quantity: 4 } });

    expect(response.status()).toBe(200);
    const cart = await cartBody(response);
    expect(cart.items[0]!.quantity).toBe(4);
    expect(cart.totalCents).toBe(mouse.priceCents * 4);
  });

  test('CART-API-021: updating a product that is not in the cart returns 404', async ({ authenticatedRequest }) => {
    const response = await authenticatedRequest.patch(`/api/cart/items/${await productIdOf(mouse.sku)}`, {
      data: { quantity: 1 },
    });

    expect(response.status()).toBe(404);
    expect(await response.json()).toEqual({ error: 'Product is not in the cart' });
  });

  test('CART-API-022: updating with an invalid quantity returns 400 and keeps the old quantity', async ({
    authenticatedRequest,
  }) => {
    await addToCart(authenticatedRequest, mouse.sku, 2);
    const id = await productIdOf(mouse.sku);

    for (const quantity of [0, -1, 100, 1.5, '3']) {
      const response = await authenticatedRequest.patch(`/api/cart/items/${id}`, { data: { quantity } });
      expect(response.status(), `quantity ${String(quantity)}`).toBe(400);
    }
    expect((await getCart(authenticatedRequest)).items[0]!.quantity).toBe(2);
  });

  test('CART-API-023: updating above the stock returns 409 and keeps the old quantity', async ({
    authenticatedRequest,
  }) => {
    await addToCart(authenticatedRequest, beanie.sku, 1);
    const id = await productIdOf(beanie.sku);

    const response = await authenticatedRequest.patch(`/api/cart/items/${id}`, {
      data: { quantity: beanie.stockQuantity + 1 },
    });

    expect(response.status()).toBe(409);
    expect(await response.json()).toEqual({ error: `Only ${beanie.stockQuantity} units available` });
    expect((await getCart(authenticatedRequest)).items[0]!.quantity).toBe(1);
  });

  test('CART-API-024: removing a product returns the cart without it', async ({ authenticatedRequest }) => {
    await addToCart(authenticatedRequest, mouse.sku, 1);
    await addToCart(authenticatedRequest, book.sku, 1);

    const response = await authenticatedRequest.delete(`/api/cart/items/${await productIdOf(mouse.sku)}`);

    expect(response.status()).toBe(200);
    const cart = await cartBody(response);
    expect(cart.items.map((i) => i.sku)).toEqual([book.sku]);
    expect(cart.totalCents).toBe(book.priceCents);
  });

  test('CART-API-025: removing a product twice returns 404 the second time', async ({ authenticatedRequest }) => {
    await addToCart(authenticatedRequest, mouse.sku, 1);
    const id = await productIdOf(mouse.sku);

    const first = await authenticatedRequest.delete(`/api/cart/items/${id}`);
    const second = await authenticatedRequest.delete(`/api/cart/items/${id}`);

    expect(first.status()).toBe(200);
    expect(second.status()).toBe(404);
  });

  test('CART-API-026: invalid product ids in the URL return 400', async ({ authenticatedRequest }) => {
    for (const id of ['abc', '0', '-1', '1.5']) {
      const patch = await authenticatedRequest.patch(`/api/cart/items/${id}`, { data: { quantity: 1 } });
      const del = await authenticatedRequest.delete(`/api/cart/items/${id}`);
      expect(patch.status(), `PATCH ${id}`).toBe(400);
      expect(del.status(), `DELETE ${id}`).toBe(400);
    }
  });
});

test.describe('Cart API: sessions', () => {
  test('CART-API-030: the cart survives logout and a new login', async ({ authenticatedRequest, testUser }) => {
    await addToCart(authenticatedRequest, book.sku, 2);

    await authenticatedRequest.post('/api/auth/logout');
    expect((await authenticatedRequest.get('/api/cart')).status()).toBe(401);
    await authenticatedRequest.post('/api/auth/login', { data: { email: testUser.email, password: testUser.password } });

    const cart = await getCart(authenticatedRequest);
    expect(cart.items.map((i) => [i.sku, i.quantity])).toEqual([[book.sku, 2]]);
  });

  test('CART-API-031: an expired session cannot read or change the cart', async ({ authenticatedRequest }) => {
    await addToCart(authenticatedRequest, mouse.sku, 1);
    await authenticatedRequest.post('/api/test/expire-session');

    expect((await authenticatedRequest.get('/api/cart')).status()).toBe(401);
    expect((await addToCart(authenticatedRequest, book.sku, 1)).status()).toBe(401);
  });
});

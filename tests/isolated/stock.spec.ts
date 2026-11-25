import { test, expect } from '../../fixtures/test-fixtures';
import { countOrdersForUser, findProductBySku } from '../../database/queries';
import { STOCK_TRACKING_SKU, productBySku } from '../../utils/catalog';
import { addToCart, getCart, productIdOf } from '../../utils/api-helpers';
import { buildNewUser, buildShipping } from '../../utils/test-data';

/**
 * These tests measure EXACT stock numbers of one product. They run in their own project,
 * after every parallel test has finished (see playwright.config.ts), and one at a time,
 * so nothing else changes that product's stock while they run.
 */
test.describe.configure({ mode: 'serial' });

const jacket = productBySku(STOCK_TRACKING_SKU); // stock 15

async function stockOf(request: import('@playwright/test').APIRequestContext): Promise<number> {
  const id = await productIdOf(jacket.sku);
  const body = (await (await request.get(`/api/products/${id}`)).json()) as { product: { stockQuantity: number } };
  return body.product.stockQuantity;
}

test.describe('Stock handling at checkout', () => {
  test('STK-001: placing an order lowers the stock by exactly the ordered quantity', async ({
    authenticatedRequest,
  }) => {
    const before = await stockOf(authenticatedRequest);
    await addToCart(authenticatedRequest, jacket.sku, 3);

    const response = await authenticatedRequest.post('/api/orders', { data: { shipping: buildShipping() } });

    expect(response.status()).toBe(201);
    expect(await stockOf(authenticatedRequest)).toBe(before - 3);
  });

  test('STK-002: the database stock matches the stock the API reports after an order', async ({
    authenticatedRequest,
  }) => {
    await addToCart(authenticatedRequest, jacket.sku, 2);
    await authenticatedRequest.post('/api/orders', { data: { shipping: buildShipping() } });

    const apiStock = await stockOf(authenticatedRequest);
    const dbRow = await findProductBySku(jacket.sku);

    expect(dbRow!.stock_quantity).toBe(apiStock);
  });

  test('STK-003: when another customer buys the last units first, the order fails and nothing changes', async ({
    authenticatedRequest,
    testUser,
    playwright,
    baseURL,
    trackUser,
  }) => {
    // Both customers put ALL the stock in their carts (allowed: nothing is reserved by a cart).
    const total = await stockOf(authenticatedRequest);
    await addToCart(authenticatedRequest, jacket.sku, total);

    const fast = await playwright.request.newContext({ baseURL });
    const fastUser = buildNewUser();
    trackUser(fastUser.email);
    await fast.post('/api/auth/register', { data: fastUser });
    await fast.post('/api/auth/login', { data: fastUser });
    await addToCart(fast, jacket.sku, total);

    // The fast customer buys everything first.
    expect((await fast.post('/api/orders', { data: { shipping: buildShipping() } })).status()).toBe(201);
    expect(await stockOf(authenticatedRequest)).toBe(0);

    // Now the slower customer tries to buy the same units.
    const late = await authenticatedRequest.post('/api/orders', { data: { shipping: buildShipping() } });

    expect(late.status()).toBe(409);
    expect(await late.json()).toEqual({ error: 'Insufficient stock for an item in your cart' });
    expect(await countOrdersForUser(testUser.id)).toBe(0);
    expect((await getCart(authenticatedRequest)).itemCount).toBe(total); // the cart is kept
    expect(await stockOf(authenticatedRequest)).toBe(0); // and stock did not go negative
    await fast.dispose();
  });
});

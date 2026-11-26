import { test, expect } from '../../fixtures/test-fixtures';
import {
  countOrdersForUser,
  findOrderById,
  findProductBySku,
  findUserByEmail,
  listOrderItems,
  listOrdersForUser,
  sumOfOrderItems,
} from '../../database/queries';
import { env } from '../../utils/env';
import { expectedTotalCents, productBySku } from '../../utils/catalog';
import { addToCart, getCart, productIdOf, type ApiOrder } from '../../utils/api-helpers';
import { formatCents, parsePriceToCents } from '../../utils/helpers';
import { buildShipping } from '../../utils/test-data';

/**
 * End-to-end journeys. Each test does something in a real browser and then CHECKS THE RESULT IN THE
 * API AND IN THE DATABASE, so a defect in any single layer, or a disagreement between layers, is caught.
 */
const mouse = productBySku('ELEC-001');
const sqlBook = productBySku('BOOK-003'); // "SQL for Testers"
const novel = productBySku('BOOK-002');

test.describe('Cross-layer journeys (UI, API and database)', () => {
  test('E2E-001: a shopper searches, shops and checks out, and the UI, API and database agree on the order', async ({
    page,
    loginPage,
    productsPage,
    cartPage,
    checkoutPage,
    confirmationPage,
    header,
    testUser,
  }) => {
    const shipping = buildShipping({ name: 'Alan Turing', city: 'Wilmslow', postalCode: 'SK9 1AA' });
    const expectedTotal = expectedTotalCents([
      { sku: mouse.sku, quantity: 2 },
      { sku: sqlBook.sku, quantity: 1 },
    ]);

    await test.step('log in through the login page', async () => {
      await loginPage.goto();
      await loginPage.login(testUser.email, testUser.password);
      await expect(header.userName).toHaveText(testUser.fullName);
    });

    await test.step('find the mouse by searching and add it', async () => {
      await productsPage.search('wireless');
      await expect(productsPage.names).toHaveText([mouse.name]);
      await productsPage.addToCart(mouse.name);
      await expect(header.cartCount).toHaveText('1');
    });

    await test.step('add the cheapest book from the Books category', async () => {
      await productsPage.search('');
      await productsPage.filterByCategory('Books');
      await productsPage.sortBy('price_asc');
      await expect(productsPage.names.first()).toHaveText('SQL for Testers'); // $14.99 is the cheapest book
      await productsPage.addToCart(sqlBook.name);
      await expect(header.cartCount).toHaveText('2');
    });

    await test.step('raise the mouse quantity to 2 in the cart', async () => {
      await header.cartLink.click();
      await cartPage.setQuantity(mouse.name, 2);
      await expect(cartPage.total).toHaveText(formatCents(expectedTotal));
      await expect(header.cartCount).toHaveText('3');
    });

    await test.step('API: the cart holds the same lines and total the page shows', async () => {
      const cart = await getCart(page.request);
      expect(cart.totalCents).toBe(expectedTotal);
      expect(cart.items.map((i) => [i.sku, i.quantity]).sort()).toEqual(
        [[mouse.sku, 2], [sqlBook.sku, 1]].sort(),
      );
    });

    await test.step('check out with shipping details', async () => {
      await cartPage.checkoutButton.click();
      await expect(checkoutPage.summaryTotal).toHaveText(formatCents(expectedTotal));
      await checkoutPage.fillShipping(shipping);
      await checkoutPage.placeOrder();
      await expect(page).toHaveURL(/\/orders\/\d+\/confirmation$/);
    });

    const orderId = Number(/\/orders\/(\d+)\//.exec(page.url())![1]);
    const shownTotalCents = await test.step('the confirmation page shows the order', async () => {
      await expect(confirmationPage.orderNumber).toHaveText(String(orderId));
      await expect(confirmationPage.items).toHaveCount(2);
      return parsePriceToCents((await confirmationPage.total.textContent())!);
    });

    await test.step('API: the order matches what the page showed', async () => {
      const response = await page.request.get(`/api/orders/${orderId}`);
      expect(response.status()).toBe(200);
      const { order } = (await response.json()) as { order: ApiOrder };
      expect(order.totalCents).toBe(shownTotalCents);
      expect(order.totalCents).toBe(expectedTotal);
      expect(order.shipping).toEqual(shipping);
      expect(order.items.map((i) => [i.sku, i.quantity]).sort()).toEqual([[mouse.sku, 2], [sqlBook.sku, 1]].sort());
    });

    await test.step('database: the saved order, its items and its owner match', async () => {
      const row = await findOrderById(orderId);
      expect(row).toMatchObject({
        user_id: testUser.id,
        status: 'confirmed',
        total_cents: shownTotalCents,
        shipping_name: shipping.name,
        shipping_city: shipping.city,
        shipping_postal_code: shipping.postalCode,
      });
      expect(await sumOfOrderItems(orderId)).toBe(shownTotalCents);
      const items = await listOrderItems(orderId);
      const byProduct = new Map(items.map((i) => [i.product_id, i.quantity]));
      expect(byProduct.get(await productIdOf(mouse.sku))).toBe(2);
      expect(byProduct.get(await productIdOf(sqlBook.sku))).toBe(1);
    });

    await test.step('the cart is empty in the UI, the API and the header', async () => {
      await expect(header.cartCount).toHaveText('0');
      expect((await getCart(page.request)).itemCount).toBe(0);
    });
  });

  test('E2E-002: a product has the same price in the catalog, detail page, cart, order, API and database', async ({
    loggedInPage,
    productsPage,
    productDetailPage,
    cartPage,
    checkoutPage,
    confirmationPage,
  }) => {
    const page = loggedInPage;
    const dbProduct = await findProductBySku(novel.sku);
    const prices: Record<string, number> = { database: dbProduct!.price_cents };

    await productsPage.goto();
    prices.catalog = parsePriceToCents((await productsPage.card(novel.name).getByTestId('product-price').textContent())!);

    await productsPage.openProduct(novel.name);
    prices.detail = parsePriceToCents((await productDetailPage.price.textContent())!);
    prices.api = (
      (await (await page.request.get(`/api/products/${dbProduct!.id}`)).json()) as { product: { priceCents: number } }
    ).product.priceCents;

    await productDetailPage.addToCartButton.click();
    await expect(productDetailPage.cartMessage).toHaveText('Added to cart');
    await cartPage.goto();
    prices.cart = parsePriceToCents((await cartPage.price(novel.name).textContent())!);

    await cartPage.checkoutButton.click();
    await checkoutPage.fillShipping(buildShipping());
    await checkoutPage.placeOrder();
    await expect(page).toHaveURL(/\/confirmation$/);
    prices.orderPage = parsePriceToCents((await confirmationPage.total.textContent())!); // one unit, so total = price
    const orderId = Number(/\/orders\/(\d+)\//.exec(page.url())![1]);
    prices.orderItemInDatabase = (await listOrderItems(orderId))[0]!.unit_price_cents;

    // Every layer must report exactly the seeded price.
    for (const [layer, cents] of Object.entries(prices)) {
      expect(cents, `price in the ${layer}`).toBe(novel.priceCents);
    }
  });

  test('E2E-003: a refused checkout changes nothing: no order and the cart is kept', async ({
    loggedInPage,
    checkoutPage,
    header,
    testUser,
  }) => {
    const page = loggedInPage;
    await addToCart(page.request, mouse.sku, 2);
    await checkoutPage.goto();

    await checkoutPage.fillShipping(buildShipping({ postalCode: '!!' }));
    await checkoutPage.placeOrder();

    await expect(checkoutPage.fieldError('postalCode')).toBeVisible();
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(header.cartCount).toHaveText('2'); // UI: cart kept
    expect((await getCart(page.request)).itemCount).toBe(2); // API: cart kept
    expect(await countOrdersForUser(testUser.id)).toBe(0); // database: no order
    expect(((await (await page.request.get('/api/orders')).json()) as { orders: unknown[] }).orders).toEqual([]);
  });

  test('E2E-004: an order survives logging out and back in, in the UI, the API and the database', async ({
    loggedInPage,
    cartPage,
    checkoutPage,
    confirmationPage,
    loginPage,
    header,
    testUser,
  }) => {
    const page = loggedInPage;
    await addToCart(page.request, novel.sku, 1);
    await cartPage.goto();
    await cartPage.checkoutButton.click();
    await checkoutPage.fillShipping(buildShipping());
    await checkoutPage.placeOrder();
    await expect(page).toHaveURL(/\/confirmation$/);
    const confirmationUrl = page.url();
    const orderId = Number(/\/orders\/(\d+)\//.exec(confirmationUrl)![1]);

    await header.logout();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto(confirmationUrl); // logged out: the order page must be protected
    await expect(page).toHaveURL(/\/login$/);

    await loginPage.login(testUser.email, testUser.password);
    await expect(page).toHaveURL(/\/products$/);
    await page.goto(confirmationUrl);
    await expect(confirmationPage.orderNumber).toHaveText(String(orderId));
    await expect(confirmationPage.total).toHaveText(formatCents(novel.priceCents));

    const { orders } = (await (await page.request.get('/api/orders')).json()) as { orders: ApiOrder[] };
    expect(orders.map((o) => o.id)).toEqual([orderId]);
    expect((await listOrdersForUser(testUser.id)).map((o) => o.id)).toEqual([orderId]);
  });

  test('E2E-005: after a customer buys in the UI, an administrator sees the same order and the customer', async ({
    loggedInPage,
    cartPage,
    checkoutPage,
    playwright,
    baseURL,
    testUser,
  }) => {
    const page = loggedInPage;
    await addToCart(page.request, mouse.sku, 3);
    await cartPage.goto();
    await cartPage.checkoutButton.click();
    await checkoutPage.fillShipping(buildShipping());
    await checkoutPage.placeOrder();
    await expect(page).toHaveURL(/\/confirmation$/);
    const orderId = Number(/\/orders\/(\d+)\//.exec(page.url())![1]);

    const admin = await playwright.request.newContext({ baseURL });
    const login = await admin.post('/api/auth/login', { data: { email: env.adminEmail, password: env.testUser.password } });
    expect(login.status()).toBe(200);
    const order = ((await (await admin.get(`/api/orders/${orderId}`)).json()) as { order: ApiOrder }).order;
    const users = ((await (await admin.get('/api/admin/users')).json()) as { users: Array<{ email: string }> }).users;
    await admin.dispose();

    expect(order.totalCents).toBe(mouse.priceCents * 3);
    expect(order.totalCents).toBe((await findOrderById(orderId))!.total_cents);
    expect(users.map((u) => u.email)).toContain(testUser.email);
    expect(await findUserByEmail(testUser.email)).toBeDefined();
  });
});

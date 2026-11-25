import { test, expect } from '../../fixtures/test-fixtures';
import type { ShippingField } from '../../pages/CheckoutPage';
import { expectedTotalCents, productBySku } from '../../utils/catalog';
import { addToCart } from '../../utils/api-helpers';
import { countOrdersForUser } from '../../database/queries';
import { formatCents } from '../../utils/helpers';
import { buildNewUser, buildShipping } from '../../utils/test-data';

// Products used here have plenty of stock. The Wool Beanie and the Denim Jacket are reserved
// for stock-limit tests and must never be bought in this file.
const mouse = productBySku('ELEC-001');
const book = productBySku('BOOK-001');
const tshirt = productBySku('CLTH-001');

const FIELD_ERRORS: Record<ShippingField, string> = {
  name: 'Name is required',
  email: 'A valid email is required',
  address: 'Address is required',
  city: 'City is required',
  postalCode: 'Postal code must be 3-10 letters, digits, spaces or hyphens',
};
const FIELDS = Object.keys(FIELD_ERRORS) as ShippingField[];

test.describe('Checkout (UI)', () => {
  // Every test starts logged in (setup and cleanup come from the fixture).
  test.beforeEach(async ({ loggedInPage }) => {
    void loggedInPage;
  });

  test('CHK-UI-001: the order summary lists the cart items and the total', async ({ page, checkoutPage }) => {
    await addToCart(page.request, mouse.sku, 2);
    await addToCart(page.request, book.sku, 1);

    await checkoutPage.goto();

    await expect(checkoutPage.summaryItems).toHaveCount(2);
    await expect(checkoutPage.summaryItems.filter({ hasText: mouse.name })).toContainText(
      `× 2 — ${formatCents(mouse.priceCents * 2)}`,
    );
    await expect(checkoutPage.summaryItems.filter({ hasText: book.name })).toContainText(
      `× 1 — ${formatCents(book.priceCents)}`,
    );
    await expect(checkoutPage.summaryTotal).toHaveText(
      formatCents(expectedTotalCents([{ sku: mouse.sku, quantity: 2 }, { sku: book.sku, quantity: 1 }])),
    );
  });

  test('CHK-UI-002: a valid order is placed and the confirmation shows the order details', async ({
    page,
    checkoutPage,
    confirmationPage,
    header,
  }) => {
    const shipping = buildShipping({ name: 'Ada Lovelace', city: 'London', postalCode: 'N1 9GU' });
    await addToCart(page.request, mouse.sku, 2);
    await addToCart(page.request, tshirt.sku, 1);
    await checkoutPage.goto();

    await checkoutPage.fillShipping(shipping);
    await checkoutPage.placeOrder();

    await expect(page).toHaveURL(/\/orders\/\d+\/confirmation$/);
    const orderId = /\/orders\/(\d+)\//.exec(page.url())![1]!;
    await expect(confirmationPage.heading).toHaveText('Thank you for your order!');
    await expect(confirmationPage.orderNumber).toHaveText(orderId);
    await expect(confirmationPage.status).toHaveText('confirmed');
    await expect(confirmationPage.items).toHaveCount(2);
    await expect(confirmationPage.items.filter({ hasText: mouse.name })).toContainText(
      `× 2 — ${formatCents(mouse.priceCents * 2)}`,
    );
    await expect(confirmationPage.total).toHaveText(
      formatCents(expectedTotalCents([{ sku: mouse.sku, quantity: 2 }, { sku: tshirt.sku, quantity: 1 }])),
    );
    for (const text of [shipping.name, shipping.address, shipping.city, shipping.postalCode, shipping.email]) {
      await expect(confirmationPage.shipping).toContainText(text);
    }
    await expect(header.cartCount).toHaveText('0'); // the cart was emptied by the order
  });

  test('CHK-UI-003: the total is the same in the cart, the checkout summary and the confirmation', async ({
    page,
    cartPage,
    checkoutPage,
    confirmationPage,
  }) => {
    await addToCart(page.request, book.sku, 3);
    await addToCart(page.request, tshirt.sku, 2);
    const expected = formatCents(
      expectedTotalCents([{ sku: book.sku, quantity: 3 }, { sku: tshirt.sku, quantity: 2 }]),
    );

    await cartPage.goto();
    await expect(cartPage.total).toHaveText(expected);
    await cartPage.checkoutButton.click();
    await expect(checkoutPage.summaryTotal).toHaveText(expected);
    await checkoutPage.fillShipping(buildShipping());
    await checkoutPage.placeOrder();

    await expect(confirmationPage.total).toHaveText(expected);
  });

  test('CHK-UI-004: submitting an empty form shows an error under every field and places no order', async ({
    page,
    checkoutPage,
    testUser,
    header,
  }) => {
    await addToCart(page.request, mouse.sku, 1);
    await checkoutPage.goto();

    await checkoutPage.placeOrder();

    for (const field of FIELDS) {
      await expect(checkoutPage.fieldError(field)).toHaveText(FIELD_ERRORS[field]);
    }
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(header.cartCount).toHaveText('1'); // the cart is untouched
    expect(await countOrdersForUser(testUser.id)).toBe(0);
  });

  for (const missing of FIELDS) {
    test(`CHK-UI-005: leaving "${missing}" empty shows only that field's error`, async ({ page, checkoutPage }) => {
      await addToCart(page.request, mouse.sku, 1);
      await checkoutPage.goto();

      await checkoutPage.fillShipping(buildShipping({ [missing]: '' }));
      await checkoutPage.placeOrder();

      await expect(checkoutPage.fieldError(missing)).toHaveText(FIELD_ERRORS[missing]);
      for (const other of FIELDS.filter((f) => f !== missing)) {
        await expect(checkoutPage.fieldError(other)).toHaveText('');
      }
      await expect(page).toHaveURL(/\/checkout$/);
    });
  }

  for (const email of ['plainaddress', 'name@', '@example.test', 'name@example', 'na me@example.test']) {
    test(`CHK-UI-006: the invalid email "${email}" is rejected`, async ({ page, checkoutPage }) => {
      await addToCart(page.request, mouse.sku, 1);
      await checkoutPage.goto();

      await checkoutPage.fillShipping(buildShipping({ email }));
      await checkoutPage.placeOrder();

      await expect(checkoutPage.fieldError('email')).toHaveText(FIELD_ERRORS.email);
      await expect(page).toHaveURL(/\/checkout$/);
    });
  }

  for (const postalCode of ['12', '!!!!!', '12345678901', '-1234', '12 34 56 78 9']) {
    test(`CHK-UI-007: the invalid postal code "${postalCode}" is rejected`, async ({ page, checkoutPage }) => {
      await addToCart(page.request, mouse.sku, 1);
      await checkoutPage.goto();

      await checkoutPage.fillShipping(buildShipping({ postalCode }));
      await checkoutPage.placeOrder();

      await expect(checkoutPage.fieldError('postalCode')).toHaveText(FIELD_ERRORS.postalCode);
    });
  }

  for (const postalCode of ['123', 'SW1A 1AA', 'K1A-0B1', '1234567890']) {
    test(`CHK-UI-008: the valid postal code "${postalCode}" is accepted`, async ({ page, checkoutPage }) => {
      await addToCart(page.request, mouse.sku, 1);
      await checkoutPage.goto();

      await checkoutPage.fillShipping(buildShipping({ postalCode }));
      await checkoutPage.placeOrder();

      await expect(page).toHaveURL(/\/confirmation$/);
    });
  }

  test('CHK-UI-009: a name made only of spaces is treated as empty', async ({ page, checkoutPage }) => {
    await addToCart(page.request, mouse.sku, 1);
    await checkoutPage.goto();

    await checkoutPage.fillShipping(buildShipping({ name: '' }));
    await checkoutPage.input('name').fill('     ');
    await checkoutPage.placeOrder();

    await expect(checkoutPage.fieldError('name')).toHaveText(FIELD_ERRORS.name);
  });

  test('CHK-UI-010: errors disappear once the details are corrected and the order goes through', async ({
    page,
    checkoutPage,
  }) => {
    await addToCart(page.request, mouse.sku, 1);
    await checkoutPage.goto();
    await checkoutPage.placeOrder();
    await expect(checkoutPage.fieldError('name')).toHaveText(FIELD_ERRORS.name);

    await checkoutPage.fillShipping(buildShipping());
    await checkoutPage.placeOrder();

    await expect(page).toHaveURL(/\/confirmation$/);
  });

  test('CHK-UI-011: with an empty cart the checkout page says so and cannot place an order', async ({
    checkoutPage,
  }) => {
    await checkoutPage.goto();

    await expect(checkoutPage.formError).toHaveText('Your cart is empty');
    await expect(checkoutPage.placeOrderButton).toBeDisabled();
    await expect(checkoutPage.summaryItems).toHaveCount(0);
  });

  test('CHK-UI-012: after an order the cart is empty and the checkout page refuses a second order', async ({
    page,
    checkoutPage,
    cartPage,
  }) => {
    await addToCart(page.request, mouse.sku, 1);
    await checkoutPage.goto();
    await checkoutPage.fillShipping(buildShipping());
    await checkoutPage.placeOrder();
    await expect(page).toHaveURL(/\/confirmation$/);

    await cartPage.goto();
    await expect(cartPage.emptyMessage).toBeVisible();
    await checkoutPage.goto();
    await expect(checkoutPage.placeOrderButton).toBeDisabled();
  });

  test('CHK-UI-013: double-clicking "Place order" creates exactly one order', async ({
    page,
    checkoutPage,
    testUser,
  }) => {
    await addToCart(page.request, mouse.sku, 1);
    await checkoutPage.goto();
    await checkoutPage.fillShipping(buildShipping());

    await checkoutPage.placeOrderButton.dblclick();

    await expect(page).toHaveURL(/\/confirmation$/);
    await page.waitForLoadState('networkidle');
    await expect.poll(() => countOrdersForUser(testUser.id), { timeout: 5_000 }).toBe(1);
  });

  test('CHK-UI-014: a customer cannot open another customer\'s order confirmation', async ({
    page,
    confirmationPage,
    playwright,
    baseURL,
    trackUser,
  }) => {
    // Another customer places an order through the API.
    const other = await playwright.request.newContext({ baseURL });
    const otherUser = buildNewUser();
    trackUser(otherUser.email);
    await other.post('/api/auth/register', { data: otherUser });
    await other.post('/api/auth/login', { data: otherUser });
    await addToCart(other, mouse.sku, 1);
    const created = await other.post('/api/orders', { data: { shipping: buildShipping() } });
    const orderId = ((await created.json()) as { order: { id: number } }).order.id;
    await other.dispose();

    await confirmationPage.goto(orderId); // the logged-in test user is someone else

    await expect(confirmationPage.heading).toHaveText('Order unavailable');
    await expect(confirmationPage.error).toHaveText('You do not have access to this order');
    await expect(page.getByTestId('order-number')).toHaveCount(0);
  });

  test('CHK-UI-015: an order number that does not exist shows "Order not found"', async ({ confirmationPage }) => {
    await confirmationPage.goto(999999999);

    await expect(confirmationPage.heading).toHaveText('Order unavailable');
    await expect(confirmationPage.error).toHaveText('Order not found');
  });
});

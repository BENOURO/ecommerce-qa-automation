import { test, expect } from '../../fixtures/test-fixtures';
import { LIMITED_STOCK_SKU, expectedTotalCents, productBySku } from '../../utils/catalog';
import { addToCart } from '../../utils/api-helpers';
import { formatCents } from '../../utils/helpers';

const mouse = productBySku('ELEC-001'); // $24.99
const book = productBySku('BOOK-001'); // $19.99
const socks = productBySku('CLTH-003'); // $9.99
const beanie = productBySku(LIMITED_STOCK_SKU); // $12.99, stock 5

test.describe('Shopping cart (UI)', () => {
  // Every test starts logged in. Asking for the fixture here runs its setup (register + login)
  // before each test and its cleanup after; tests then use the same `page`.
  test.beforeEach(async ({ loggedInPage }) => {
    void loggedInPage;
  });

  test('CART-UI-001: a new user sees an empty cart with a link back to the products', async ({
    page,
    cartPage,
    header,
  }) => {
    await cartPage.goto();

    await expect(cartPage.emptyMessage).toContainText('Your cart is empty');
    await expect(cartPage.emptyMessage.getByRole('link', { name: 'Browse products' })).toBeVisible();
    await expect(cartPage.rows).toHaveCount(0);
    await expect(cartPage.checkoutButton).toBeHidden();
    await expect(header.cartCount).toHaveText('0');
  });

  test('CART-UI-002: adding a product from the catalog puts it in the cart', async ({
    page,
    productsPage,
    cartPage,
    header,
  }) => {
    await productsPage.goto();
    await productsPage.addToCart(mouse.name);

    await expect(productsPage.cartMessage).toHaveText(`Added "${mouse.name}" to cart`);
    await expect(header.cartCount).toHaveText('1');

    await header.cartLink.click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(cartPage.rows).toHaveCount(1);
    await expect(cartPage.price(mouse.name)).toHaveText(formatCents(mouse.priceCents));
    await expect(cartPage.quantityInput(mouse.name)).toHaveValue('1');
    await expect(cartPage.subtotal(mouse.name)).toHaveText(formatCents(mouse.priceCents));
    await expect(cartPage.total).toHaveText(formatCents(mouse.priceCents));
  });

  test('CART-UI-003: adding from the product page with a chosen quantity', async ({
    page,
    productsPage,
    productDetailPage,
    cartPage,
  }) => {
    await productsPage.goto();
    await productsPage.openProduct(book.name);
    await productDetailPage.quantityInput.fill('3');
    await productDetailPage.addToCartButton.click();
    await expect(productDetailPage.cartMessage).toHaveText('Added to cart');

    await cartPage.goto();
    await expect(cartPage.quantityInput(book.name)).toHaveValue('3');
    await expect(cartPage.subtotal(book.name)).toHaveText(formatCents(book.priceCents * 3));
  });

  test('CART-UI-004: adding the same product twice increases its quantity instead of adding a second row', async ({
    productsPage,
    cartPage,
    header,
  }) => {
    await productsPage.goto();
    await productsPage.addToCart(mouse.name);
    await expect(header.cartCount).toHaveText('1');
    await productsPage.addToCart(mouse.name);
    await expect(header.cartCount).toHaveText('2');

    await cartPage.goto();
    await expect(cartPage.rows).toHaveCount(1);
    await expect(cartPage.quantityInput(mouse.name)).toHaveValue('2');
  });

  test('CART-UI-005: the cart lists several products and the total is the sum of all lines', async ({
    page,
    cartPage,
    header,
  }) => {
    await addToCart(page.request, mouse.sku, 2);
    await addToCart(page.request, book.sku, 3);
    await addToCart(page.request, socks.sku, 1);

    await cartPage.goto();

    await expect(cartPage.rows).toHaveCount(3);
    await expect(cartPage.subtotal(mouse.name)).toHaveText(formatCents(mouse.priceCents * 2));
    await expect(cartPage.subtotal(book.name)).toHaveText(formatCents(book.priceCents * 3));
    await expect(cartPage.subtotal(socks.name)).toHaveText(formatCents(socks.priceCents));
    const expected = expectedTotalCents([
      { sku: mouse.sku, quantity: 2 },
      { sku: book.sku, quantity: 3 },
      { sku: socks.sku, quantity: 1 },
    ]);
    await expect(cartPage.total).toHaveText(formatCents(expected)); // 4998 + 5997 + 999 = $119.94
    await expect(header.cartCount).toHaveText('6'); // header counts units, not rows
  });

  test('CART-UI-006: prices in the cart match the catalog prices', async ({
    page,
    productsPage,
    cartPage,
  }) => {
    await addToCart(page.request, book.sku, 1);
    await productsPage.goto();
    const catalogPrice = await productsPage.card(book.name).getByTestId('product-price').textContent();

    await cartPage.goto();

    await expect(cartPage.price(book.name)).toHaveText(catalogPrice!.trim());
  });

  test('CART-UI-007: changing a quantity updates the line total, the cart total and the header count', async ({
    page,
    cartPage,
    header,
  }) => {
    await addToCart(page.request, mouse.sku, 1);
    await addToCart(page.request, socks.sku, 1);
    await cartPage.goto();

    await cartPage.setQuantity(mouse.name, 4);

    await expect(cartPage.subtotal(mouse.name)).toHaveText(formatCents(mouse.priceCents * 4));
    await expect(cartPage.total).toHaveText(
      formatCents(expectedTotalCents([{ sku: mouse.sku, quantity: 4 }, { sku: socks.sku, quantity: 1 }])),
    );
    await expect(header.cartCount).toHaveText('5');
  });

  test('CART-UI-008: removing a product updates the total', async ({ page, cartPage, header }) => {
    await addToCart(page.request, mouse.sku, 1);
    await addToCart(page.request, book.sku, 2);
    await cartPage.goto();

    await cartPage.remove(mouse.name);

    await expect(cartPage.row(mouse.name)).toHaveCount(0);
    await expect(cartPage.rows).toHaveCount(1);
    await expect(cartPage.total).toHaveText(formatCents(book.priceCents * 2));
    await expect(header.cartCount).toHaveText('2');
  });

  test('CART-UI-009: removing the last product shows the empty cart again', async ({ page, cartPage, header }) => {
    await addToCart(page.request, mouse.sku, 1);
    await cartPage.goto();

    await cartPage.remove(mouse.name);

    await expect(cartPage.emptyMessage).toBeVisible();
    await expect(cartPage.rows).toHaveCount(0);
    await expect(header.cartCount).toHaveText('0');
  });

  test('CART-UI-010: a quantity above the available stock is refused and the cart is unchanged', async ({
    page,
    cartPage,
  }) => {
    await addToCart(page.request, beanie.sku, 1);
    await cartPage.goto();

    await cartPage.setQuantity(beanie.name, beanie.stockQuantity + 1);

    await expect(cartPage.errorMessage).toHaveText(`Only ${beanie.stockQuantity} units available`);
    await expect(cartPage.quantityInput(beanie.name)).toHaveValue('1');
    await expect(cartPage.total).toHaveText(formatCents(beanie.priceCents));
  });

  test('CART-UI-011: the largest quantity the stock allows is accepted', async ({ page, cartPage }) => {
    await addToCart(page.request, beanie.sku, 1);
    await cartPage.goto();

    await cartPage.setQuantity(beanie.name, beanie.stockQuantity);

    await expect(cartPage.errorMessage).toHaveText('');
    await expect(cartPage.subtotal(beanie.name)).toHaveText(formatCents(beanie.priceCents * beanie.stockQuantity));
  });

  for (const invalid of [0, -2, 100]) {
    test(`CART-UI-012: quantity ${invalid} is refused with a message and the cart is unchanged`, async ({
      page,
      cartPage,
    }) => {
      await addToCart(page.request, mouse.sku, 2);
      await cartPage.goto();

      await cartPage.setQuantity(mouse.name, invalid);

      await expect(cartPage.errorMessage).toHaveText('quantity must be an integer between 1 and 99');
      await expect(cartPage.quantityInput(mouse.name)).toHaveValue('2');
    });
  }

  test('CART-UI-013: the product page refuses a quantity above the stock', async ({
    page,
    productDetailPage,
    productsPage,
  }) => {
    await productsPage.goto();
    await productsPage.openProduct(beanie.name);

    await productDetailPage.quantityInput.fill(String(beanie.stockQuantity + 1));
    await productDetailPage.addToCartButton.click();

    await expect(productDetailPage.cartMessage).toHaveText(`Only ${beanie.stockQuantity} units available`);
  });

  test('CART-UI-014: the cart is still there after a page refresh', async ({ page, cartPage }) => {
    await addToCart(page.request, mouse.sku, 2);
    await cartPage.goto();
    await expect(cartPage.rows).toHaveCount(1);

    await page.reload();

    await expect(cartPage.rows).toHaveCount(1);
    await expect(cartPage.quantityInput(mouse.name)).toHaveValue('2');
    await expect(cartPage.total).toHaveText(formatCents(mouse.priceCents * 2));
  });

  test('CART-UI-015: the cart is kept after logging out and back in', async ({
    page,
    cartPage,
    header,
    loginPage,
    testUser,
  }) => {
    await addToCart(page.request, book.sku, 2);
    await cartPage.goto();
    await header.logout();
    await expect(page).toHaveURL(/\/login$/);

    await loginPage.login(testUser.email, testUser.password);
    await expect(page).toHaveURL(/\/products$/);
    await expect(header.cartCount).toHaveText('2');

    await cartPage.goto();
    await expect(cartPage.quantityInput(book.name)).toHaveValue('2');
  });

  test('CART-UI-016: "Proceed to checkout" opens the checkout page', async ({ page, cartPage }) => {
    await addToCart(page.request, mouse.sku, 1);
    await cartPage.goto();

    await cartPage.checkoutButton.click();

    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
  });

  test('CART-UI-017: an expired session in the cart sends the user to the login page', async ({
    page,
    cartPage,
  }) => {
    await addToCart(page.request, mouse.sku, 1);
    await cartPage.goto();
    await page.request.post('/api/test/expire-session');

    await page.reload();

    await expect(page).toHaveURL(/\/login$/);
  });
});

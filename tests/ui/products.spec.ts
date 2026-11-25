import { test, expect } from '../../fixtures/test-fixtures';
import {
  allProducts,
  byNameAscending,
  byPriceAscending,
  byPriceDescending,
  inCategory,
  inStockOnly,
  namesOf,
  outOfStock,
  type ApiProduct,
  type Category,
} from '../../utils/catalog';
import { formatCents } from '../../utils/helpers';

test.describe('Product catalog (UI)', () => {
  test.beforeEach(async ({ productsPage }) => {
    await productsPage.goto();
  });

  test('PROD-UI-001: the catalog lists every product with its name, category and price', async ({
    productsPage,
  }) => {
    await expect(productsPage.cards).toHaveCount(allProducts().length);
    await expect(productsPage.resultsCount).toHaveText(`${allProducts().length} product(s)`);

    for (const product of allProducts()) {
      const card = productsPage.card(product.name);
      await expect(card).toHaveCount(1);
      await expect(card.getByTestId('product-price')).toHaveText(formatCents(product.priceCents));
      await expect(card).toContainText(product.category);
    }
  });

  test('PROD-UI-002: every product card shows a picture that actually loaded', async ({ productsPage }) => {
    await expect(productsPage.cards).toHaveCount(allProducts().length);

    for (const image of await productsPage.cards.getByTestId('product-image').all()) {
      await image.scrollIntoViewIfNeeded(); // images load lazily, as the user scrolls
      await expect
        .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth), {
          message: 'image should be downloaded and decoded',
        })
        .toBeGreaterThan(0);
    }
  });

  test('PROD-UI-003: the catalog shows the same data as the API', async ({ productsPage, request }) => {
    const response = await request.get('/api/products');
    const { products } = (await response.json()) as { products: ApiProduct[] };

    await expect(productsPage.names).toHaveText(products.map((p) => p.name));
    await expect(productsPage.prices).toHaveText(products.map((p) => formatCents(p.priceCents)));
  });

  test('PROD-UI-004: clicking a product opens its detail page with the right information', async ({
    productsPage,
    productDetailPage,
    page,
  }) => {
    const product = allProducts()[1]!; // Mechanical Keyboard
    await productsPage.openProduct(product.name);

    await expect(page).toHaveURL(/\/products\/\d+$/);
    await expect(productDetailPage.name).toHaveText(product.name);
    await expect(productDetailPage.sku).toHaveText(`SKU: ${product.sku}`);
    await expect(productDetailPage.category).toHaveText(product.category);
    await expect(productDetailPage.price).toHaveText(formatCents(product.priceCents));
    await expect(productDetailPage.description).toHaveText(product.description);
    await expect(productDetailPage.stock).toHaveText('In stock');
    await expect(productDetailPage.addToCartButton).toBeEnabled();
  });

  test('PROD-UI-005: search finds a product by name, ignoring upper and lower case', async ({ productsPage }) => {
    await productsPage.search('KEYBOARD');

    await expect(productsPage.names).toHaveText(['Mechanical Keyboard']);
    await expect(productsPage.resultsCount).toHaveText('1 product(s)');
  });

  test('PROD-UI-006: search matches part of a name and can return several products', async ({ productsPage }) => {
    await productsPage.search('t'); // "T-Shirt", "Test", "Testers", "Beanie"... any name with a t

    const expected = allProducts().filter((p) => p.name.toLowerCase().includes('t'));
    await expect(productsPage.names).toHaveText(namesOf(expected));
  });

  test('PROD-UI-007: a search with no match shows a "no products" message', async ({ productsPage }) => {
    await productsPage.search('zzz-no-such-product');

    await expect(productsPage.noResults).toBeVisible();
    await expect(productsPage.cards).toHaveCount(0);
    await expect(productsPage.resultsCount).toHaveText('0 product(s)');
  });

  test('PROD-UI-008: percent and underscore in a search are matched literally, not as wildcards', async ({
    productsPage,
  }) => {
    await productsPage.search('%');
    await expect(productsPage.cards).toHaveCount(0);

    await productsPage.search('_');
    await expect(productsPage.cards).toHaveCount(0);
  });

  test('PROD-UI-009: clearing the search brings back the full catalog', async ({ productsPage }) => {
    await productsPage.search('mouse');
    await expect(productsPage.cards).toHaveCount(1);

    await productsPage.search('');

    await expect(productsPage.cards).toHaveCount(allProducts().length);
  });

  for (const category of ['Electronics', 'Books', 'Clothing'] as Category[]) {
    test(`PROD-UI-010: filtering by ${category} shows only ${category} products`, async ({ productsPage }) => {
      await productsPage.filterByCategory(category);

      await expect(productsPage.names).toHaveText(namesOf(inCategory(category)));
    });
  }

  test('PROD-UI-011: the "in stock only" filter hides unavailable products', async ({ productsPage }) => {
    await productsPage.showInStockOnly();

    await expect(productsPage.names).toHaveText(namesOf(inStockOnly()));
    for (const product of outOfStock()) {
      await expect(productsPage.card(product.name)).toHaveCount(0);
    }
  });

  test('PROD-UI-012: category and "in stock only" filters work together', async ({ productsPage }) => {
    await productsPage.filterByCategory('Electronics');
    await productsPage.showInStockOnly();

    await expect(productsPage.names).toHaveText(namesOf(inStockOnly(inCategory('Electronics'))));
  });

  test('PROD-UI-013: sorting by price, low to high, orders the products and keeps all of them', async ({
    productsPage,
  }) => {
    await productsPage.sortBy('price_asc');

    const expected = byPriceAscending();
    await expect(productsPage.prices).toHaveText(expected.map((p) => formatCents(p.priceCents)));
    await expect(productsPage.names).toHaveText(namesOf(expected));
  });

  test('PROD-UI-014: sorting by price, high to low, reverses the order', async ({ productsPage }) => {
    await productsPage.sortBy('price_desc');

    const expected = byPriceDescending();
    await expect(productsPage.prices).toHaveText(expected.map((p) => formatCents(p.priceCents)));
    await expect(productsPage.names).toHaveText(namesOf(expected));
  });

  test('PROD-UI-015: sorting by name orders the products alphabetically', async ({ productsPage }) => {
    await productsPage.sortBy('name_asc');

    await expect(productsPage.names).toHaveText(namesOf(byNameAscending()));
  });

  test('PROD-UI-016: sorting applies to filtered results', async ({ productsPage }) => {
    await productsPage.filterByCategory('Books');
    await productsPage.sortBy('price_desc');

    await expect(productsPage.names).toHaveText(namesOf(byPriceDescending(inCategory('Books'))));
  });

  for (const product of outOfStock()) {
    test(`PROD-UI-017: "${product.name}" is shown as out of stock and cannot be added to the cart`, async ({
      productsPage,
    }) => {
      const card = productsPage.card(product.name);

      await expect(card.getByTestId('stock-status')).toHaveText('Out of stock');
      await expect(card.getByTestId('add-to-cart')).toBeDisabled();
    });

    test(`PROD-UI-018: the detail page of "${product.name}" is shown as out of stock`, async ({
      productsPage,
      productDetailPage,
    }) => {
      await productsPage.openProduct(product.name);

      await expect(productDetailPage.stock).toHaveText('Out of stock');
      await expect(productDetailPage.addToCartButton).toBeDisabled();
    });
  }

  test('PROD-UI-019: products in stock show "In stock" and an enabled button', async ({ productsPage }) => {
    const product = inStockOnly()[0]!;
    const card = productsPage.card(product.name);

    await expect(card.getByTestId('stock-status')).toHaveText('In stock');
    await expect(card.getByTestId('add-to-cart')).toBeEnabled();
  });

  test('PROD-UI-020: an anonymous visitor who adds a product to the cart is sent to the login page', async ({
    productsPage,
    page,
  }) => {
    await productsPage.addToCart(inStockOnly()[0]!.name);

    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('Product detail page (UI)', () => {
  for (const id of ['999999', 'abc', '0']) {
    test(`PROD-UI-021: /products/${id} shows a "not found" message`, async ({ productDetailPage }) => {
      await productDetailPage.goto(id);

      await expect(productDetailPage.notFound).toHaveText('Product not found.');
    });
  }
});

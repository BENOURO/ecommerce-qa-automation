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
} from '../../utils/catalog';

async function listProducts(
  request: import('@playwright/test').APIRequestContext,
  query = '',
): Promise<ApiProduct[]> {
  const response = await request.get(`/api/products${query}`);
  expect(response.status()).toBe(200);
  return ((await response.json()) as { products: ApiProduct[] }).products;
}

test.describe('Products API: list', () => {
  test('PROD-API-001: returns 200 and every seeded product with the expected values', async ({ request }) => {
    const products = await listProducts(request);

    expect(products).toHaveLength(allProducts().length);
    expect(products.map((p) => ({ sku: p.sku, name: p.name, category: p.category, priceCents: p.priceCents })))
      .toEqual(allProducts().map((p) => ({ sku: p.sku, name: p.name, category: p.category, priceCents: p.priceCents })));
    expect(products.map((p) => p.description)).toEqual(allProducts().map((p) => p.description));
  });

  test('PROD-API-002: every product has exactly the documented fields with the right types', async ({ request }) => {
    const products = await listProducts(request);

    for (const product of products) {
      expect(Object.keys(product).sort()).toEqual(
        ['category', 'description', 'id', 'inStock', 'name', 'priceCents', 'sku', 'stockQuantity'],
      );
      expect(product).toEqual({
        id: expect.any(Number),
        sku: expect.stringMatching(/^[A-Z]{4}-\d{3}$/),
        name: expect.any(String),
        description: expect.any(String),
        category: expect.stringMatching(/^(Electronics|Books|Clothing)$/),
        priceCents: expect.any(Number),
        stockQuantity: expect.any(Number),
        inStock: expect.any(Boolean),
      });
      expect(Number.isInteger(product.priceCents)).toBe(true);
      expect(product.priceCents).toBeGreaterThanOrEqual(0);
    }
  });

  test('PROD-API-003: inStock is consistent with the stock quantity', async ({ request }) => {
    for (const product of await listProducts(request)) {
      expect(product.inStock, product.sku).toBe(product.stockQuantity > 0);
    }
    const unavailable = (await listProducts(request)).filter((p) => !p.inStock).map((p) => p.sku);
    expect(unavailable.sort()).toEqual(outOfStock().map((p) => p.sku).sort());
  });

  test('PROD-API-004: the default order is by id', async ({ request }) => {
    const ids = (await listProducts(request)).map((p) => p.id);

    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  test('PROD-API-005: the catalog is public and needs no login', async ({ request }) => {
    const response = await request.get('/api/products');

    expect(response.status()).toBe(200);
  });
});

test.describe('Products API: sorting, searching and filtering', () => {
  test('PROD-API-010: sort=price_asc orders by price, lowest first', async ({ request }) => {
    const products = await listProducts(request, '?sort=price_asc');

    expect(products.map((p) => p.priceCents)).toEqual(byPriceAscending().map((p) => p.priceCents));
  });

  test('PROD-API-011: sort=price_desc orders by price, highest first', async ({ request }) => {
    const products = await listProducts(request, '?sort=price_desc');

    expect(products.map((p) => p.priceCents)).toEqual(byPriceDescending().map((p) => p.priceCents));
  });

  test('PROD-API-012: sort=name_asc orders alphabetically', async ({ request }) => {
    const products = await listProducts(request, '?sort=name_asc');

    expect(products.map((p) => p.name)).toEqual(namesOf(byNameAscending()));
  });

  test('PROD-API-013: an unknown sort option returns 400', async ({ request }) => {
    const response = await request.get('/api/products?sort=price; DROP TABLE products');

    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ error: 'Unknown sort option' });
  });

  test('PROD-API-014: search matches names ignoring case', async ({ request }) => {
    const products = await listProducts(request, '?search=WIRELESS');

    expect(products.map((p) => p.name)).toEqual(['Wireless Mouse']);
  });

  test('PROD-API-015: search with no match returns 200 and an empty list', async ({ request }) => {
    const products = await listProducts(request, '?search=zzz-no-such-product');

    expect(products).toEqual([]);
  });

  test('PROD-API-016: wildcard characters in search are matched literally', async ({ request }) => {
    expect(await listProducts(request, '?search=%25')).toEqual([]); // %
    expect(await listProducts(request, '?search=_')).toEqual([]);
  });

  test('PROD-API-017: a SQL injection attempt in search is harmless and leaves the data intact', async ({
    request,
  }) => {
    const injected = await listProducts(request, `?search=${encodeURIComponent("'; DROP TABLE products; --")}`);

    expect(injected).toEqual([]);
    expect(await listProducts(request)).toHaveLength(allProducts().length); // the table still exists
  });

  for (const category of ['Electronics', 'Books', 'Clothing'] as const) {
    test(`PROD-API-018: category=${category} returns only ${category} products`, async ({ request }) => {
      const products = await listProducts(request, `?category=${category}`);

      expect(products.map((p) => p.name)).toEqual(namesOf(inCategory(category)));
      expect(products.every((p) => p.category === category)).toBe(true);
    });
  }

  test('PROD-API-019: an unknown category returns 400', async ({ request }) => {
    const response = await request.get('/api/products?category=Furniture');

    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ error: 'Unknown category' });
  });

  test('PROD-API-020: inStock=true returns only available products', async ({ request }) => {
    const products = await listProducts(request, '?inStock=true');

    expect(products.map((p) => p.name)).toEqual(namesOf(inStockOnly()));
    expect(products.every((p) => p.stockQuantity > 0)).toBe(true);
  });

  test('PROD-API-021: filters and sorting can be combined', async ({ request }) => {
    const products = await listProducts(request, '?category=Books&inStock=true&sort=price_desc');

    expect(products.map((p) => p.name)).toEqual(namesOf(byPriceDescending(inStockOnly(inCategory('Books')))));
  });
});

test.describe('Products API: single product', () => {
  test('PROD-API-030: GET /api/products/:id returns the same product the list shows', async ({ request }) => {
    const [first] = await listProducts(request);

    const response = await request.get(`/api/products/${first!.id}`);

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ product: first });
  });

  for (const id of ['abc', '0', '-1', '1.5', '99999999999', '1;DROP']) {
    test(`PROD-API-031: an invalid product id "${id}" returns 400`, async ({ request }) => {
      const response = await request.get(`/api/products/${encodeURIComponent(id)}`);

      expect(response.status()).toBe(400);
      expect(await response.json()).toEqual({ error: 'Product id must be a positive integer' });
    });
  }

  test('PROD-API-032: a product id that does not exist returns 404', async ({ request }) => {
    const response = await request.get('/api/products/999999');

    expect(response.status()).toBe(404);
    expect(await response.json()).toEqual({ error: 'Product not found' });
  });
});

test.describe('Products API: error handling', () => {
  test('PROD-API-040: an unknown API route returns a JSON 404', async ({ request }) => {
    const response = await request.get('/api/does-not-exist');

    expect(response.status()).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found' });
  });

  test('PROD-API-041: the catalog cannot be changed through the API (no POST route)', async ({ request }) => {
    const response = await request.post('/api/products', { data: { name: 'Hacked', priceCents: 1 } });

    expect(response.status()).toBe(404);
    expect(await listProducts(request)).toHaveLength(allProducts().length);
  });
});

import { test, expect } from '../../fixtures/test-fixtures';
import { query } from '../../database/connection';
import {
  countOrphanOrderItems,
  countProductsByCategory,
  findProductBySku,
  searchProductNames,
  type ProductRow,
} from '../../database/queries';
import { rollbackOnly } from '../../database/transaction';
import { seedProducts } from '../../database/seed-data';
import { addToCart, placeOrder } from '../../utils/api-helpers';
import { allProducts, inCategory, type ApiProduct, type Category } from '../../utils/catalog';

const insertProduct = `
  INSERT INTO products (sku, name, description, category, price_cents, stock_quantity)
  VALUES ($1, $2, $3, $4, $5, $6)`;

test.describe('Products table: records', () => {
  test('DB-PRD-001: every seeded product is stored with its seed name, description, category and price', async () => {
    const rows = await query<ProductRow>('SELECT * FROM products ORDER BY id');

    expect(
      rows.map((r) => ({
        sku: r.sku,
        name: r.name,
        description: r.description,
        category: r.category,
        priceCents: r.price_cents,
      })),
    ).toEqual(
      seedProducts.map((p) => ({
        sku: p.sku,
        name: p.name,
        description: p.description,
        category: p.category,
        priceCents: p.priceCents,
      })),
    );
  });

  test('DB-PRD-002: stock is never negative and never higher than the seeded amount', async () => {
    for (const seed of seedProducts) {
      const row = await findProductBySku(seed.sku);
      expect(row!.stock_quantity, seed.sku).toBeGreaterThanOrEqual(0);
      // Orders lower stock and cleanup restores it, so it can only ever be at or below the seed value.
      expect(row!.stock_quantity, seed.sku).toBeLessThanOrEqual(seed.stockQuantity);
    }
  });

  test('DB-PRD-003: the unavailable products have no stock and the others do', async () => {
    const rows = await query<{ sku: string; stock_quantity: number }>(
      'SELECT sku, stock_quantity FROM products WHERE stock_quantity = 0 ORDER BY sku',
    );

    expect(rows.map((r) => r.sku)).toEqual(
      seedProducts.filter((p) => p.stockQuantity === 0).map((p) => p.sku).sort(),
    );
  });

  test('DB-PRD-004: prices are whole cents, SKUs are unique and every product has text', async () => {
    const [stats] = await query<{ distinct_skus: number; total: number; fractional: number; blank: number }>(
      `SELECT count(DISTINCT sku)::int AS distinct_skus,
              count(*)::int AS total,
              count(*) FILTER (WHERE price_cents <> round(price_cents))::int AS fractional,
              count(*) FILTER (WHERE btrim(name) = '' OR btrim(description) = '')::int AS blank
         FROM products`,
    );

    expect(stats!.distinct_skus).toBe(stats!.total);
    expect(stats!.fractional).toBe(0);
    expect(stats!.blank).toBe(0);
  });

  test('DB-PRD-005: the number of products per category matches the seed data', async () => {
    const counts = await countProductsByCategory();

    for (const category of ['Electronics', 'Books', 'Clothing'] as Category[]) {
      expect(counts[category], category).toBe(inCategory(category).length);
    }
  });

  test('DB-PRD-006: no order item points at a missing order or product', async () => {
    expect(await countOrphanOrderItems()).toBe(0);
  });
});

test.describe('Products table: rules enforced by the database itself', () => {
  test('DB-PRD-010: a negative price is refused (check violation 23514)', async () => {
    await rollbackOnly(async (client) => {
      await expect(client.query(insertProduct, ['NEG-001', 'Negative', 'x', 'Books', -1, 1])).rejects.toMatchObject({
        code: '23514',
      });
    });
  });

  test('DB-PRD-011: a negative stock is refused (check violation 23514)', async () => {
    await rollbackOnly(async (client) => {
      await expect(client.query(insertProduct, ['NEG-002', 'Negative', 'x', 'Books', 100, -5])).rejects.toMatchObject({
        code: '23514',
      });
    });
  });

  test('DB-PRD-012: two products cannot share a SKU (unique violation 23505)', async () => {
    await rollbackOnly(async (client) => {
      await expect(
        client.query(insertProduct, [seedProducts[0]!.sku, 'Copy', 'x', 'Books', 100, 1]),
      ).rejects.toMatchObject({ code: '23505', constraint: 'products_sku_key' });
    });
  });

  test('DB-PRD-013: stock cannot be lowered below zero by an update', async () => {
    await rollbackOnly(async (client) => {
      await expect(
        client.query('UPDATE products SET stock_quantity = stock_quantity - $1 WHERE sku = $2', [10_000, seedProducts[0]!.sku]),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  test('DB-PRD-014: a product cannot be deleted while order items still refer to it', async ({
    authenticatedRequest,
  }) => {
    await addToCart(authenticatedRequest, seedProducts[1]!.sku, 1);
    await placeOrder(authenticatedRequest);

    await rollbackOnly(async (client) => {
      await expect(client.query('DELETE FROM products WHERE sku = $1', [seedProducts[1]!.sku])).rejects.toMatchObject({
        code: '23503',
      });
    });
  });
});

test.describe('Products: API and database agree', () => {
  test('DB-PRD-020: the API shows the same price, category and availability as the database', async ({ request }) => {
    const { products } = (await (await request.get('/api/products')).json()) as { products: ApiProduct[] };
    const rows = await query<ProductRow>('SELECT * FROM products ORDER BY id');

    expect(products).toHaveLength(rows.length);
    for (const row of rows) {
      const api = products.find((p) => p.sku === row.sku)!;
      expect(api, row.sku).toBeDefined();
      expect(api.priceCents, row.sku).toBe(row.price_cents);
      expect(api.category, row.sku).toBe(row.category);
      expect(api.name, row.sku).toBe(row.name);
      expect(api.inStock, `${row.sku} availability`).toBe(row.stock_quantity > 0);
    }
  });

  for (const term of ['mouse', 'T', 'book', 'er', 'zzz']) {
    test(`DB-PRD-021: searching "${term}" returns the same products through the API and a SQL query`, async ({
      request,
    }) => {
      const { products } = (await (await request.get(`/api/products?search=${encodeURIComponent(term)}`)).json()) as {
        products: ApiProduct[];
      };

      expect(products.map((p) => p.name)).toEqual(await searchProductNames(term));
    });
  }

  test('DB-PRD-022: the API lists the same products as the seed data defines', async ({ request }) => {
    const { products } = (await (await request.get('/api/products')).json()) as { products: ApiProduct[] };

    expect(products.map((p) => p.sku).sort()).toEqual(allProducts().map((p) => p.sku).sort());
  });
});

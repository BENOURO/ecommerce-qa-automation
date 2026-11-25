import { test, expect } from '../../fixtures/test-fixtures';
import { seedProducts } from '../../database/seed-data';
import { countProducts, findProductBySku, findUserByEmail } from '../../database/queries';

test.describe('Database smoke @smoke', () => {
  test('database contains the seeded products', async () => {
    expect(await countProducts()).toBe(seedProducts.length);
  });

  test('seeded product record matches the seed data', async () => {
    const mouse = seedProducts[0]!;

    const row = await findProductBySku(mouse.sku);

    // Stock is not compared: checkout tests running in parallel legitimately change it.
    expect(row).toMatchObject({
      name: mouse.name,
      category: mouse.category,
      price_cents: mouse.priceCents,
    });
    expect(row!.stock_quantity).toBeLessThanOrEqual(mouse.stockQuantity);
  });

  test('a user registered through the API is stored with a hashed password', async ({ testUser }) => {
    const row = await findUserByEmail(testUser.email);

    expect(row, 'user row should exist').toBeDefined();
    expect(row!.full_name).toBe(testUser.fullName);
    expect(row!.password_hash).not.toBe(testUser.password);
    expect(row!.password_hash).toMatch(/^\$2[aby]\$/); // bcrypt hash prefix
  });
});

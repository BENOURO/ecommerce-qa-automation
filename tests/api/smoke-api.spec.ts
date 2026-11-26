import { test, expect } from '../../fixtures/test-fixtures';
import { seedProducts } from '../../database/seed-data';

test.describe('API smoke @smoke', () => {
  test('SMK-API-001: health endpoint reports the service is up', async ({ request }) => {
    const response = await request.get('/api/health');

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  test('SMK-API-002: product catalog returns every seeded product', async ({ request }) => {
    const response = await request.get('/api/products');

    expect(response.status()).toBe(200);
    const body = (await response.json()) as { products: Array<{ sku: string }> };
    expect(body.products.map((p) => p.sku).sort()).toEqual(seedProducts.map((p) => p.sku).sort());
  });

  test('SMK-API-003: a freshly registered user can log in', async ({ request, testUser }) => {
    const response = await request.post('/api/auth/login', {
      data: { email: testUser.email, password: testUser.password },
    });

    expect(response.status()).toBe(200);
    const body = (await response.json()) as { user: { email: string } };
    expect(body.user.email).toBe(testUser.email);
  });
});

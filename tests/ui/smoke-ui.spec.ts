import { test, expect } from '../../fixtures/test-fixtures';
import { seedProducts } from '../../database/seed-data';

test.describe('UI smoke @smoke', () => {
  test('catalog page lists every seeded product', async ({ page }) => {
    await page.goto('/products');

    await expect(page.getByTestId('product-card')).toHaveCount(seedProducts.length);
    await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible();
  });

  test('a logged-in user sees their name in the header', async ({ loggedInPage, testUser }) => {
    await loggedInPage.goto('/products');

    await expect(loggedInPage.getByTestId('user-name')).toHaveText(testUser.fullName);
    await expect(loggedInPage.getByTestId('cart-count')).toHaveText('0');
  });
});

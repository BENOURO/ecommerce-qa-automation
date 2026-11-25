import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';
import { closePool } from '../database/connection';
import { deleteUserAndOrders, findUserByEmail } from '../database/queries';
import { HeaderComponent } from '../pages/HeaderComponent';
import { CartPage } from '../pages/CartPage';
import { LoginPage } from '../pages/LoginPage';
import { ProductDetailPage } from '../pages/ProductDetailPage';
import { ProductsPage } from '../pages/ProductsPage';
import { buildNewUser, type NewUser } from '../utils/test-data';

export interface TestUser extends NewUser {
  id: number;
}

interface TestFixtures {
  /** A fresh user, registered through the API before the test and deleted (with their orders) after it. */
  testUser: TestUser;
  /** A browser page that is already logged in as `testUser`. */
  loggedInPage: Page;
  /** Page objects, created for the test's page. */
  loginPage: LoginPage;
  header: HeaderComponent;
  productsPage: ProductsPage;
  productDetailPage: ProductDetailPage;
  cartPage: CartPage;
  /** An API client already logged in as `testUser` (its cookie jar keeps the session). */
  authenticatedRequest: APIRequestContext;
  /** For tests that create users themselves: register the email here and it is deleted after the test. */
  trackUser: (email: string) => void;
}

interface WorkerFixtures {
  closeDatabasePool: void;
}

/**
 * Fixtures are Playwright's dependency injection: a test asks for `testUser` by name in its
 * arguments, and Playwright runs the setup before the test and the teardown (code after `use`)
 * after it, even when the test fails.
 */
export const test = base.extend<TestFixtures, WorkerFixtures>({
  testUser: async ({ request }, use) => {
    const data = buildNewUser();
    const response = await request.post('/api/auth/register', { data });
    expect(response.status(), 'registering the test user should succeed').toBe(201);
    const { user } = (await response.json()) as { user: { id: number } };

    await use({ ...data, id: user.id });

    await deleteUserAndOrders(user.id); // cleanup keeps the database tidy and stock exact
  },

  loggedInPage: async ({ page, testUser }, use) => {
    // page.request shares cookies with the page, so logging in here also logs the browser in.
    const response = await page.request.post('/api/auth/login', {
      data: { email: testUser.email, password: testUser.password },
    });
    expect(response.status(), 'logging in the test user should succeed').toBe(200);
    await use(page);
  },

  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  header: async ({ page }, use) => {
    await use(new HeaderComponent(page));
  },

  productsPage: async ({ page }, use) => {
    await use(new ProductsPage(page));
  },

  productDetailPage: async ({ page }, use) => {
    await use(new ProductDetailPage(page));
  },

  cartPage: async ({ page }, use) => {
    await use(new CartPage(page));
  },

  authenticatedRequest: async ({ request, testUser }, use) => {
    const response = await request.post('/api/auth/login', {
      data: { email: testUser.email, password: testUser.password },
    });
    expect(response.status(), 'logging in the API client should succeed').toBe(200);
    await use(request);
  },

  trackUser: async ({}, use) => {
    const emails: string[] = [];
    await use((email) => emails.push(email.toLowerCase()));
    for (const email of emails) {
      const user = await findUserByEmail(email);
      if (user) await deleteUserAndOrders(user.id);
    }
  },

  // Worker-scoped and automatic: closes the DB connection pool once when a worker finishes,
  // so the worker process can exit cleanly.
  closeDatabasePool: [
    async ({}, use) => {
      await use();
      await closePool();
    },
    { scope: 'worker', auto: true },
  ],
});

export { expect };

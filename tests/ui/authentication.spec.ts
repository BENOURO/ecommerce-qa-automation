import { test, expect } from '../../fixtures/test-fixtures';

test.describe('Authentication (UI)', () => {
  test('AUTH-UI-001: user logs in with valid credentials and lands on the catalog', async ({
    loginPage,
    header,
    page,
    testUser,
  }) => {
    await loginPage.goto();
    await loginPage.login(testUser.email, testUser.password);

    await expect(page).toHaveURL(/\/products$/);
    await expect(header.userName).toHaveText(testUser.fullName);
    await expect(header.logoutButton).toBeVisible();
  });

  test('AUTH-UI-002: login is rejected for an unknown email', async ({ loginPage, page, testUser }) => {
    await loginPage.goto();
    await loginPage.login('nobody.here@example.test', testUser.password);

    await expect(loginPage.errorMessage).toHaveText('Invalid email or password');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('AUTH-UI-003: login is rejected for a wrong password', async ({ loginPage, page, testUser }) => {
    await loginPage.goto();
    await loginPage.login(testUser.email, 'definitely-the-wrong-password');

    await expect(loginPage.errorMessage).toHaveText('Invalid email or password');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('AUTH-UI-004: submitting an empty form shows a required-fields message', async ({ loginPage, page }) => {
    await loginPage.goto();
    await loginPage.submitButton.click();

    await expect(loginPage.errorMessage).toHaveText('Email and password are required');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('AUTH-UI-005: a missing password is rejected', async ({ loginPage, testUser }) => {
    await loginPage.goto();
    await loginPage.login(testUser.email, '');

    await expect(loginPage.errorMessage).toHaveText('Email and password are required');
  });

  test('AUTH-UI-006: a missing email is rejected', async ({ loginPage, testUser }) => {
    await loginPage.goto();
    await loginPage.login('', testUser.password);

    await expect(loginPage.errorMessage).toHaveText('Email and password are required');
  });

  test('AUTH-UI-007: the password field masks what is typed', async ({ loginPage }) => {
    await loginPage.goto();

    await expect(loginPage.passwordInput).toHaveAttribute('type', 'password');
  });

  test('AUTH-UI-008: logging out ends the session and returns to the login page', async ({
    loggedInPage,
    header,
  }) => {
    await loggedInPage.goto('/products');
    await header.logout();

    await expect(loggedInPage).toHaveURL(/\/login$/);
    await expect(header.loginLink).toBeVisible();

    // The session is really gone: protected pages are no longer reachable.
    await loggedInPage.goto('/cart');
    await expect(loggedInPage).toHaveURL(/\/login$/);
  });

  for (const path of ['/cart', '/checkout', '/orders/1/confirmation']) {
    test(`AUTH-UI-009: ${path} redirects an anonymous visitor to the login page`, async ({ page }) => {
      await page.goto(path);

      await expect(page).toHaveURL(/\/login$/);
    });
  }

  test('AUTH-UI-010: a logged-in user visiting the login page is sent to the catalog', async ({ loggedInPage }) => {
    await loggedInPage.goto('/login');

    await expect(loggedInPage).toHaveURL(/\/products$/);
  });

  test('AUTH-UI-011: the session survives a page reload', async ({ loggedInPage, header, testUser }) => {
    await loggedInPage.goto('/products');
    await loggedInPage.reload();

    await expect(header.userName).toHaveText(testUser.fullName);
  });

  test('AUTH-UI-012: the session is shared by a second tab in the same browser', async ({
    loggedInPage, // logs the browser context in
    context,
  }) => {
    expect(loggedInPage).toBeDefined();
    const secondTab = await context.newPage();
    await secondTab.goto('/cart');

    await expect(secondTab).toHaveURL(/\/cart$/); // not redirected to /login
    await expect(secondTab.getByRole('heading', { name: 'Your cart' })).toBeVisible();
  });

  test('AUTH-UI-013: an expired session sends the user back to the login page', async ({ loggedInPage, header }) => {
    await loggedInPage.goto('/products');
    await expect(header.logoutButton).toBeVisible();

    // Test-only endpoint: expires the session on the server without waiting for the timeout.
    const expire = await loggedInPage.request.post('/api/test/expire-session');
    expect(expire.status()).toBe(204);

    await loggedInPage.goto('/cart');
    await expect(loggedInPage).toHaveURL(/\/login$/);
    await expect(header.loginLink).toBeVisible();
  });
});

import type { Locator, Page } from '@playwright/test';

/** The navigation bar that appears on every page. */
export class HeaderComponent {
  readonly userName: Locator;
  readonly cartCount: Locator;
  readonly cartLink: Locator;
  readonly logoutButton: Locator;
  readonly loginLink: Locator;

  constructor(page: Page) {
    this.userName = page.getByTestId('user-name');
    this.cartCount = page.getByTestId('cart-count');
    this.cartLink = page.getByTestId('nav-cart');
    this.logoutButton = page.getByTestId('logout-button');
    this.loginLink = page.getByTestId('nav-login');
  }

  async logout(): Promise<void> {
    await this.logoutButton.click();
  }
}

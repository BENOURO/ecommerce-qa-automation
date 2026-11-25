import type { Locator, Page } from '@playwright/test';

/**
 * Page Object for /login. It hides HOW elements are found (locators) so tests describe
 * WHAT the user does. If the page markup changes, only this file needs updating.
 */
export class LoginPage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  constructor(private readonly page: Page) {
    this.emailInput = page.getByTestId('login-email');
    this.passwordInput = page.getByTestId('login-password');
    this.submitButton = page.getByTestId('login-submit');
    this.errorMessage = page.getByTestId('login-error');
  }

  async goto(): Promise<void> {
    await this.page.goto('/login');
  }

  /** Fills the form (skipping empty values) and submits it. */
  async login(email: string, password: string): Promise<void> {
    if (email) await this.emailInput.fill(email);
    if (password) await this.passwordInput.fill(password);
    await this.submitButton.click();
  }
}

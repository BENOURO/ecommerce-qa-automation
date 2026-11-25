import type { Locator, Page } from '@playwright/test';

/** Page Object for /orders/:id/confirmation. */
export class ConfirmationPage {
  readonly heading: Locator;
  readonly orderNumber: Locator;
  readonly status: Locator;
  readonly items: Locator;
  readonly total: Locator;
  readonly shipping: Locator;
  readonly error: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByTestId('confirmation-heading');
    this.orderNumber = page.getByTestId('order-number');
    this.status = page.getByTestId('order-status');
    this.items = page.getByTestId('order-item');
    this.total = page.getByTestId('order-total');
    this.shipping = page.getByTestId('order-shipping');
    this.error = page.getByTestId('order-error');
  }

  async goto(orderId: number | string): Promise<void> {
    await this.page.goto(`/orders/${orderId}/confirmation`);
  }
}

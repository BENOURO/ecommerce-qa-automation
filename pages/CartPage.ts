import type { Locator, Page } from '@playwright/test';

/** Page Object for the shopping cart at /cart. */
export class CartPage {
  readonly rows: Locator;
  readonly total: Locator;
  readonly emptyMessage: Locator;
  readonly errorMessage: Locator;
  readonly checkoutButton: Locator;

  constructor(private readonly page: Page) {
    this.rows = page.getByTestId('cart-item');
    this.total = page.getByTestId('cart-total');
    this.emptyMessage = page.getByTestId('cart-empty');
    this.errorMessage = page.getByTestId('cart-error');
    this.checkoutButton = page.getByTestId('checkout-button');
  }

  async goto(): Promise<void> {
    await this.page.goto('/cart');
  }

  /** The cart row of one product, found by its name. */
  row(name: string): Locator {
    return this.rows.filter({ has: this.page.getByTestId('item-name').filter({ hasText: name }) });
  }

  price(name: string): Locator {
    return this.row(name).getByTestId('item-price');
  }

  quantityInput(name: string): Locator {
    return this.row(name).getByTestId('item-quantity');
  }

  subtotal(name: string): Locator {
    return this.row(name).getByTestId('item-subtotal');
  }

  /** Types a new quantity and leaves the field, which is what saves the change in the shop. */
  async setQuantity(name: string, quantity: number | string): Promise<void> {
    const input = this.quantityInput(name);
    await input.fill(String(quantity));
    await input.press('Tab');
  }

  async remove(name: string): Promise<void> {
    await this.row(name).getByTestId('item-remove').click();
  }
}

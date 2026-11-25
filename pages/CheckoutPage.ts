import type { Locator, Page } from '@playwright/test';
import type { ShippingDetails } from '../utils/test-data';

export type ShippingField = keyof ShippingDetails;

/** Page Object for /checkout (shipping form and order summary). */
export class CheckoutPage {
  readonly placeOrderButton: Locator;
  readonly formError: Locator;
  readonly summaryItems: Locator;
  readonly summaryTotal: Locator;
  private readonly inputs: Record<ShippingField, Locator>;

  constructor(private readonly page: Page) {
    this.placeOrderButton = page.getByTestId('place-order');
    this.formError = page.getByTestId('checkout-error');
    this.summaryItems = page.getByTestId('summary-item');
    this.summaryTotal = page.getByTestId('summary-total');
    this.inputs = {
      name: page.getByTestId('checkout-name'),
      email: page.getByTestId('checkout-email'),
      address: page.getByTestId('checkout-address'),
      city: page.getByTestId('checkout-city'),
      postalCode: page.getByTestId('checkout-postal-code'),
    };
  }

  async goto(): Promise<void> {
    await this.page.goto('/checkout');
  }

  input(field: ShippingField): Locator {
    return this.inputs[field];
  }

  /** The validation message shown under one field. */
  fieldError(field: ShippingField): Locator {
    return this.page.getByTestId(`error-${field}`);
  }

  /** Fills the form. Fields that are empty strings are left blank. */
  async fillShipping(details: ShippingDetails): Promise<void> {
    for (const field of Object.keys(this.inputs) as ShippingField[]) {
      if (details[field] !== '') await this.inputs[field].fill(details[field]);
    }
  }

  async placeOrder(): Promise<void> {
    await this.placeOrderButton.click();
  }
}

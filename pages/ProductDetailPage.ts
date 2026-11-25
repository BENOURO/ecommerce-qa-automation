import type { Locator, Page } from '@playwright/test';

/** Page Object for a product detail page, /products/:id. */
export class ProductDetailPage {
  readonly name: Locator;
  readonly sku: Locator;
  readonly category: Locator;
  readonly price: Locator;
  readonly stock: Locator;
  readonly description: Locator;
  readonly quantityInput: Locator;
  readonly addToCartButton: Locator;
  readonly notFound: Locator;
  readonly cartMessage: Locator;

  constructor(private readonly page: Page) {
    this.name = page.getByTestId('detail-name');
    this.sku = page.getByTestId('detail-sku');
    this.category = page.getByTestId('detail-category');
    this.price = page.getByTestId('detail-price');
    this.stock = page.getByTestId('detail-stock');
    this.description = page.getByTestId('detail-description');
    this.quantityInput = page.getByTestId('detail-quantity');
    this.addToCartButton = page.getByTestId('detail-add-to-cart');
    this.notFound = page.getByTestId('product-not-found');
    this.cartMessage = page.getByTestId('cart-message');
  }

  /** Opens /products/<id>. The id is a string so tests can also try invalid ones. */
  async goto(id: number | string): Promise<void> {
    await this.page.goto(`/products/${id}`);
  }
}

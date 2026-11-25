import type { Locator, Page } from '@playwright/test';

/** Page Object for the catalog at /products. */
export class ProductsPage {
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly categoryFilter: Locator;
  readonly sortSelect: Locator;
  readonly inStockFilter: Locator;
  readonly cards: Locator;
  readonly names: Locator;
  readonly prices: Locator;
  readonly resultsCount: Locator;
  readonly noResults: Locator;
  readonly cartMessage: Locator;

  constructor(private readonly page: Page) {
    this.searchInput = page.getByTestId('search-input');
    this.searchButton = page.getByTestId('search-button');
    this.categoryFilter = page.getByTestId('category-filter');
    this.sortSelect = page.getByTestId('sort-select');
    this.inStockFilter = page.getByTestId('in-stock-filter');
    this.cards = page.getByTestId('product-card');
    this.names = page.getByTestId('product-name');
    this.prices = page.getByTestId('product-price');
    this.resultsCount = page.getByTestId('results-count');
    this.noResults = page.getByTestId('no-results');
    this.cartMessage = page.getByTestId('cart-message');
  }

  async goto(): Promise<void> {
    await this.page.goto('/products');
  }

  /** The card of one product, found by its name. */
  card(name: string): Locator {
    return this.cards.filter({ has: this.names.filter({ hasText: name }) });
  }

  async search(text: string): Promise<void> {
    await this.searchInput.fill(text);
    await this.searchButton.click();
  }

  async filterByCategory(category: 'Electronics' | 'Books' | 'Clothing' | ''): Promise<void> {
    await this.categoryFilter.selectOption(category);
  }

  async sortBy(option: 'price_asc' | 'price_desc' | 'name_asc' | ''): Promise<void> {
    await this.sortSelect.selectOption(option);
  }

  async showInStockOnly(): Promise<void> {
    await this.inStockFilter.check();
  }

  async addToCart(name: string): Promise<void> {
    await this.card(name).getByTestId('add-to-cart').click();
  }

  async openProduct(name: string): Promise<void> {
    await this.card(name).getByTestId('product-name').click();
  }
}

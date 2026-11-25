import { seedProducts, type SeedProduct } from '../database/seed-data';

/**
 * Expected catalog data, derived from the seed data (the single source of truth).
 * Tests compare what the shop shows against these, instead of re-typing names and prices.
 * Each helper returns a new array in the order the shop should show it.
 */
export type Category = SeedProduct['category'];

export const allProducts = (): SeedProduct[] => [...seedProducts];

export function productBySku(sku: string): SeedProduct {
  const product = seedProducts.find((p) => p.sku === sku);
  if (!product) throw new Error(`No seeded product with SKU ${sku}`);
  return product;
}

/**
 * RESERVED for stock-limit tests (cart limits): no other test may BUY this product,
 * because buying lowers its stock and would make the limit tests unpredictable in parallel runs.
 */
export const LIMITED_STOCK_SKU = 'CLTH-004'; // Wool Beanie, stock 5

/** Sum of price x quantity, computed from the seed data: the expected cart total in cents. */
export function expectedTotalCents(lines: ReadonlyArray<{ sku: string; quantity: number }>): number {
  return lines.reduce((sum, line) => sum + productBySku(line.sku).priceCents * line.quantity, 0);
}

export const inCategory = (category: Category): SeedProduct[] =>
  seedProducts.filter((p) => p.category === category);

export const inStockOnly = (products: readonly SeedProduct[] = seedProducts): SeedProduct[] =>
  products.filter((p) => p.stockQuantity > 0);

export const outOfStock = (): SeedProduct[] => seedProducts.filter((p) => p.stockQuantity === 0);

export const byPriceAscending = (products: readonly SeedProduct[] = seedProducts): SeedProduct[] =>
  [...products].sort((a, b) => a.priceCents - b.priceCents);

export const byPriceDescending = (products: readonly SeedProduct[] = seedProducts): SeedProduct[] =>
  [...products].sort((a, b) => b.priceCents - a.priceCents);

export const byNameAscending = (products: readonly SeedProduct[] = seedProducts): SeedProduct[] =>
  [...products].sort((a, b) => a.name.localeCompare(b.name, 'en'));

export const namesOf = (products: readonly SeedProduct[]): string[] => products.map((p) => p.name);

/** Product as returned by the API. */
export interface ApiProduct {
  id: number;
  sku: string;
  name: string;
  description: string;
  category: string;
  priceCents: number;
  stockQuantity: number;
  inStock: boolean;
}

import { seedProducts, type SeedProduct } from '../database/seed-data';

/**
 * Expected catalog data, derived from the seed data (the single source of truth).
 * Tests compare what the shop shows against these, instead of re-typing names and prices.
 * Each helper returns a new array in the order the shop should show it.
 */
export type Category = SeedProduct['category'];

export const allProducts = (): SeedProduct[] => [...seedProducts];

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

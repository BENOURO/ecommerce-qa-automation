import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { findProductBySku } from '../database/queries';
import { buildShipping, type ShippingDetails } from './test-data';

export interface ApiCartItem {
  productId: number;
  sku: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

export interface ApiCart {
  items: ApiCartItem[];
  itemCount: number;
  totalCents: number;
}

/** Looks up a product's database id from its SKU (ids are assigned by the database). */
export async function productIdOf(sku: string): Promise<number> {
  const product = await findProductBySku(sku);
  expect(product, `seeded product ${sku} should exist`).toBeDefined();
  return product!.id;
}

/** Adds a product to the cart of whoever `request` is logged in as. Returns the raw response. */
export async function addToCart(request: APIRequestContext, sku: string, quantity = 1): Promise<APIResponse> {
  return request.post('/api/cart/items', { data: { productId: await productIdOf(sku), quantity } });
}

export async function getCart(request: APIRequestContext): Promise<ApiCart> {
  const response = await request.get('/api/cart');
  expect(response.status()).toBe(200);
  return ((await response.json()) as { cart: ApiCart }).cart;
}

export interface ApiOrder {
  id: number;
  status: string;
  totalCents: number;
  createdAt: string;
  shipping: ShippingDetails;
  items: Array<{
    productId: number;
    sku: string;
    name: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }>;
}

/** Places an order for the current cart and returns it. The cart must contain items. */
export async function placeOrder(
  request: APIRequestContext,
  shipping: ShippingDetails = buildShipping(),
): Promise<ApiOrder> {
  const response = await request.post('/api/orders', { data: { shipping } });
  expect(response.status(), 'the order should be accepted').toBe(201);
  return ((await response.json()) as { order: ApiOrder }).order;
}

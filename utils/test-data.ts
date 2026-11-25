import { randomBytes } from 'node:crypto';

export interface NewUser {
  email: string;
  password: string;
  fullName: string;
}

export interface ShippingDetails {
  name: string;
  email: string;
  address: string;
  city: string;
  postalCode: string;
}

/**
 * Builds a brand-new, unique user for one test. Unique emails mean tests never collide,
 * even when they run in parallel. The password is random, so no credentials live in the code.
 */
export function buildNewUser(overrides: Partial<NewUser> = {}): NewUser {
  const id = randomBytes(6).toString('hex');
  return {
    email: `qa.${id}@example.test`,
    password: `Pw-${randomBytes(9).toString('base64url')}`,
    fullName: `QA Tester ${id}`,
    ...overrides,
  };
}

/** Valid shipping details (fake data, no real person or address). */
export function buildShipping(overrides: Partial<ShippingDetails> = {}): ShippingDetails {
  return {
    name: 'Test Buyer',
    email: 'buyer@example.test',
    address: '1 Test Street',
    city: 'Testville',
    postalCode: '12345',
    ...overrides,
  };
}

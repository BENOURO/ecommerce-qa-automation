import { env } from '../utils/env';

/**
 * SEEDED DEFECTS, for demonstrating that the test suite catches real bugs.
 *
 * Every defect is OFF by default. Start the app with BUGS=<name>[,<name>...] (or BUGS=all) to switch some on,
 * then run the tests and watch them fail. See docs/SEEDED-BUGS.md for which test catches which bug.
 */
export const KNOWN_BUGS = [
  'wrong-cart-total', // the cart total ignores quantities
  'order-total-ignores-quantity', // an order is charged one unit per product
  'stock-not-decreased', // ordering does not lower the stock
  'search-case-sensitive', // searching "MOUSE" finds nothing
  'sort-price-reversed', // "price low to high" sorts high to low
  'weak-password-allowed', // one-character passwords are accepted
  'leak-password-hash', // the admin user list exposes password hashes
  'oversell-in-cart', // more units than the stock can go into the cart
  'user-enumeration', // login errors reveal whether an email has an account
  'no-order-lock', // sending an order twice at once creates two orders
] as const;

export type BugName = (typeof KNOWN_BUGS)[number];

function parseBugs(setting: string): Set<BugName> {
  const names = setting
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (names.includes('all')) return new Set(KNOWN_BUGS);
  const unknown = names.filter((n) => !(KNOWN_BUGS as readonly string[]).includes(n));
  if (unknown.length > 0) {
    // A typo must never silently produce a "healthy" app.
    throw new Error(`Unknown bug name(s) in BUGS: ${unknown.join(', ')}. Known: ${KNOWN_BUGS.join(', ')}`);
  }
  return new Set(names as BugName[]);
}

const enabled = parseBugs(env.bugs);

export const hasBug = (name: BugName): boolean => enabled.has(name);
export const enabledBugs = (): BugName[] => [...enabled];

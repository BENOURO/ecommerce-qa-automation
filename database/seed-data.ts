/**
 * Deterministic seed data. Kept separate from the seed script so tests can import
 * the same expected values (test data lives apart from test logic).
 */
export interface SeedProduct {
  sku: string;
  name: string;
  description: string;
  category: 'Electronics' | 'Books' | 'Clothing';
  priceCents: number;
  stockQuantity: number;
}

export const seedProducts: readonly SeedProduct[] = [
  { sku: 'ELEC-001', name: 'Wireless Mouse', description: 'Ergonomic 2.4 GHz wireless mouse.', category: 'Electronics', priceCents: 2499, stockQuantity: 50 },
  { sku: 'ELEC-002', name: 'Mechanical Keyboard', description: 'Compact keyboard with tactile switches.', category: 'Electronics', priceCents: 8999, stockQuantity: 30 },
  { sku: 'ELEC-003', name: 'USB-C Charger', description: '65W fast charger with USB-C port.', category: 'Electronics', priceCents: 3999, stockQuantity: 100 },
  { sku: 'ELEC-004', name: 'Noise-Cancelling Headphones', description: 'Over-ear headphones, 30 hour battery.', category: 'Electronics', priceCents: 14999, stockQuantity: 0 },
  { sku: 'BOOK-001', name: 'Testing Fundamentals', description: 'Introduction to software testing concepts.', category: 'Books', priceCents: 1999, stockQuantity: 40 },
  { sku: 'BOOK-002', name: 'Clean Test Code', description: 'Writing maintainable automated tests.', category: 'Books', priceCents: 2999, stockQuantity: 25 },
  { sku: 'BOOK-003', name: 'SQL for Testers', description: 'Practical SQL for data validation.', category: 'Books', priceCents: 1499, stockQuantity: 60 },
  { sku: 'BOOK-004', name: 'Agile QA Handbook', description: 'Quality practices in agile teams.', category: 'Books', priceCents: 3499, stockQuantity: 0 },
  { sku: 'CLTH-001', name: 'Cotton T-Shirt', description: 'Plain 100% cotton t-shirt.', category: 'Clothing', priceCents: 1599, stockQuantity: 200 },
  { sku: 'CLTH-002', name: 'Denim Jacket', description: 'Classic fit denim jacket.', category: 'Clothing', priceCents: 6999, stockQuantity: 15 },
  { sku: 'CLTH-003', name: 'Running Socks (3 pack)', description: 'Breathable running socks.', category: 'Clothing', priceCents: 999, stockQuantity: 150 },
  { sku: 'CLTH-004', name: 'Wool Beanie', description: 'Warm knitted beanie.', category: 'Clothing', priceCents: 1299, stockQuantity: 5 },
];

export const seedUsers = {
  customerName: 'Standard Customer',
  adminName: 'Store Admin',
} as const;

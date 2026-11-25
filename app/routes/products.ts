import { Router } from 'express';
import { query } from '../../database/connection';
import { HttpError, parseId } from '../http';

export const productsRouter = Router();

const PRODUCT_COLUMNS = `
  id, sku, name, description, category,
  price_cents AS "priceCents",
  stock_quantity AS "stockQuantity",
  stock_quantity > 0 AS "inStock"`;

// ORDER BY direction cannot be a $n parameter, so it is chosen from this fixed whitelist
// (user input never reaches the SQL text).
const SORT_OPTIONS: Record<string, string> = {
  price_asc: 'price_cents ASC, id ASC',
  price_desc: 'price_cents DESC, id ASC',
  name_asc: 'name ASC, id ASC',
};
const CATEGORIES = ['Electronics', 'Books', 'Clothing'];

function single(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

productsRouter.get('/', async (req, res) => {
  const search = single(req.query.search);
  const category = single(req.query.category);
  const sort = single(req.query.sort);
  const inStockOnly = single(req.query.inStock) === 'true';

  if (category && !CATEGORIES.includes(category)) throw new HttpError(400, 'Unknown category');
  if (sort && !(sort in SORT_OPTIONS)) throw new HttpError(400, 'Unknown sort option');
  const orderBy = SORT_OPTIONS[sort ?? ''] ?? 'id ASC';

  // Escape LIKE wildcards so "%" and "_" in the search text are matched literally.
  const pattern = search ? `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;

  const products = await query(
    `SELECT ${PRODUCT_COLUMNS} FROM products
     WHERE ($1::text IS NULL OR name ILIKE $1)
       AND ($2::text IS NULL OR category = $2)
       AND (NOT $3::boolean OR stock_quantity > 0)
     ORDER BY ${orderBy}`,
    [pattern, category ?? null, inStockOnly],
  );
  res.status(200).json({ products });
});

productsRouter.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) throw new HttpError(400, 'Product id must be a positive integer');
  const rows = await query(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, 'Product not found');
  res.status(200).json({ product: rows[0] });
});

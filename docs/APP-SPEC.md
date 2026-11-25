# Application Under Test: QA Demo Shop (specification)

The tests are written against this specification (black-box), not against the implementation.

## Pages

| URL | Access | Purpose |
|---|---|---|
| `/` | public | Redirects to `/products` |
| `/login` | public | Login form (logged-in users are sent to `/products`) |
| `/products` | public | Catalog with search, category filter, sort, in-stock filter |
| `/products/:id` | public | Product details, quantity, add to cart |
| `/cart` | login required | Cart table, quantity update, remove, total |
| `/checkout` | login required | Order summary and shipping form (no payment) |
| `/orders/:id/confirmation` | login required | Order confirmation |

Unauthenticated access to a login-required page responds `302` to `/login`.

## API

All bodies are JSON. Errors have the shape `{ "error": "message", "details"?: { field: "message" } }`.
Money is always integer cents (`priceCents`, `totalCents`, ...).

| Method and path | Auth | Success | Errors |
|---|---|---|---|
| `GET /api/health` | none | 200 `{status}` | |
| `POST /api/auth/register` | none | 201 `{user}` | 400 validation, 409 duplicate email |
| `POST /api/auth/login` | none | 200 `{user}` + `sid` cookie | 400 missing fields, 401 invalid credentials (same message for unknown email and wrong password) |
| `POST /api/auth/logout` | any | 204, cookie cleared | |
| `GET /api/auth/me` | session | 200 `{user}` | 401 |
| `GET /api/products` | none | 200 `{products[]}`. Query: `search` (name, case-insensitive), `category`, `sort` (`price_asc`, `price_desc`, `name_asc`), `inStock=true` | 400 unknown category or sort |
| `GET /api/products/:id` | none | 200 `{product}` | 400 invalid id, 404 |
| `GET /api/cart` | session | 200 `{cart:{items[],itemCount,totalCents}}` | 401 |
| `POST /api/cart/items` `{productId, quantity}` | session | 200 `{cart}` (quantities add up) | 400 invalid, 401, 404 product, 409 out of stock or above available stock |
| `PATCH /api/cart/items/:productId` `{quantity}` | session | 200 `{cart}` | 400, 401, 404 not in cart, 409 stock |
| `DELETE /api/cart/items/:productId` | session | 200 `{cart}` | 400, 401, 404 not in cart |
| `POST /api/orders` `{shipping:{name,email,address,city,postalCode}}` | session | 201 `{order}`; cart is emptied; stock decremented | 400 validation (`details` per field) or empty cart, 401, 409 insufficient stock |
| `GET /api/orders` | session | 200 `{orders[]}` (own orders) | 401 |
| `GET /api/orders/:id` | session | 200 `{order}` | 400, 401, 403 (another user's order, unless admin), 404 |
| `GET /api/admin/users` | admin | 200 `{users[]}` | 401, 403 |
| `POST /api/test/expire-session` | session, only when `ENABLE_TEST_ENDPOINTS=true` | 204; session treated as expired | 401 |

## Product images

Each product has a picture served from `/images/products/<SKU>.jpg` (stock photos, see `docs/IMAGE-CREDITS.md`).
Cart and order items include the product `sku` so pages can show it.

## Business rules

- Passwords: minimum 8 characters, stored as bcrypt hashes. Emails are stored lowercase and matched case-insensitively at login and registration.
- Sessions: `sid` cookie (HttpOnly, SameSite=Lax), server-side, sliding expiry (`SESSION_TTL_SECONDS`, default 1800).
- Cart is per user and kept server-side: it survives page refresh and re-login (it is lost when the app restarts).
- Order total = sum of (current product price x quantity), computed server-side. Item prices are copied to `order_items.unit_price_cents`.
- Order creation is one transaction: order, items and stock decrement succeed or fail together.
- Postal code: 3-10 characters of letters, digits, spaces or hyphens.
- Seed data: 12 products in 3 categories; `ELEC-004` and `BOOK-004` have no stock.

## Known limitations of the demo app

- No registration page in the UI (registration exists as an API; tests use it to create isolated users).
- No payment step, by design.
- Carts and sessions are in memory.

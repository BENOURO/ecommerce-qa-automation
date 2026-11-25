/* Shared helpers for all pages of the demo shop. */

async function api(method, url, body) {
  const response = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = null;
  if (response.status !== 204) {
    try { data = await response.json(); } catch { data = null; }
  }
  return { status: response.status, ok: response.ok, data };
}

function money(cents) {
  return '$' + (cents / 100).toFixed(2);
}

function esc(text) {
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

/** Product picture, found by SKU convention: /images/products/<SKU>.jpg */
function productImage(sku, name) {
  return `<img src="/images/products/${encodeURIComponent(sku)}.jpg" alt="${esc(name)}" loading="lazy" data-testid="product-image">`;
}

const LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#2563eb"/><path d="M9 12h14l-1.2 10a2 2 0 0 1-2 1.8h-7.6a2 2 0 0 1-2-1.8L9 12z" fill="#fff"/><path d="M12.5 12V10.5a3.5 3.5 0 0 1 7 0V12" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';

/** Wraps the nav in a header and adds a footer (once per page). */
function decoratePage() {
  const nav = document.getElementById('nav');
  if (nav && !nav.parentElement.classList.contains('site-header')) {
    const header = document.createElement('header');
    header.className = 'site-header';
    nav.parentNode.insertBefore(header, nav);
    header.appendChild(nav);
  }
  if (!document.querySelector('footer.site-footer')) {
    document.body.insertAdjacentHTML('beforeend',
      '<footer class="site-footer">QA Demo Shop &middot; a demo application for automated testing &middot; no real payments are processed</footer>');
  }
}

/** Renders the top navigation (login state and cart count). Returns the current user or null. */
async function renderNav() {
  decoratePage();
  const nav = document.getElementById('nav');
  const me = await api('GET', '/api/auth/me');
  const user = me.ok ? me.data.user : null;
  let html = `<a class="brand" href="/products">${LOGO}QA Demo Shop</a><a href="/products" data-testid="nav-products">Products</a>`;
  if (user) {
    const cart = await api('GET', '/api/cart');
    const count = cart.ok ? cart.data.cart.itemCount : 0;
    html += `<a href="/cart" data-testid="nav-cart">Cart <span class="badge" data-testid="cart-count">${count}</span></a>`;
    html += `<span class="user" data-testid="user-name">${esc(user.fullName)}</span>`;
    html += '<button class="btn" id="logout-button" data-testid="logout-button">Log out</button>';
  } else {
    html += '<a class="btn btn-primary" href="/login" data-testid="nav-login">Log in</a>';
  }
  nav.innerHTML = html;
  const logout = document.getElementById('logout-button');
  if (logout) {
    logout.addEventListener('click', async () => {
      await api('POST', '/api/auth/logout');
      window.location.href = '/login';
    });
  }
  return user;
}

/** Redirects to the login page when the session is missing or expired. */
async function requireLogin() {
  const user = await renderNav();
  if (!user) window.location.href = '/login';
  return user;
}

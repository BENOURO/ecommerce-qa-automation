// Captures the README screenshots into docs/images/: the shop (several pages) and the two HTML test reports.
// Usage:  node --import tsx scripts/take-screenshots.mjs
// Needs: the database running, and reports/html (npm test) and reports/html-bugs (npm run test:bugs) already created.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { closePool } from '../database/connection';
import { deleteUserAndOrders } from '../database/queries';
import { env } from '../utils/env';

const outDir = 'docs/images';
mkdirSync(outDir, { recursive: true });
const base = `http://localhost:${env.appPort}`;
const viewport = { width: 1280, height: 800 };

async function waitFor(url, ms = 30_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

/** Minimal static file server so the Playwright HTML report can be opened over http. */
function serveFolder(folder, port) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.zip': 'application/zip', '.webm': 'video/webm', '.md': 'text/markdown' };
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    const file = join(folder, path === '' ? 'index.html' : path);
    if (!file.startsWith(normalize(folder)) || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

const app = spawn(process.execPath, ['--import', 'tsx', 'app/server.ts'], { env: { ...process.env, BUGS: '' }, stdio: 'ignore' });
let userId;
const browser = await chromium.launch();
try {
  await waitFor(`${base}/api/health`);
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const api = context.request;

  // A throwaway demo customer.
  const user = { email: `demo.${randomBytes(4).toString('hex')}@example.test`, password: `Pw-${randomBytes(9).toString('base64url')}`, fullName: 'Alex Demo' };
  userId = (await (await api.post(`${base}/api/auth/register`, { data: user })).json()).user.id;
  await api.post(`${base}/api/auth/login`, { data: user });
  const products = (await (await api.get(`${base}/api/products`)).json()).products;
  const idOf = (sku) => products.find((p) => p.sku === sku).id;

  const settle = async () => {
    await page.waitForLoadState('networkidle');
    // Product pictures load lazily, so scroll through the page once and wait for every image.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 80));
      }
      window.scrollTo(0, 0);
      await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
    });
  };

  await page.goto(`${base}/products`);
  await settle();
  await page.screenshot({ path: `${outDir}/shop-products.png` });

  await page.goto(`${base}/products/${idOf('ELEC-002')}`);
  await settle();
  await page.screenshot({ path: `${outDir}/shop-product-detail.png` });

  for (const [sku, quantity] of [['ELEC-001', 2], ['BOOK-003', 1], ['CLTH-001', 1]]) {
    await api.post(`${base}/api/cart/items`, { data: { productId: idOf(sku), quantity } });
  }
  await page.goto(`${base}/cart`);
  await page.getByTestId('cart-total').waitFor();
  await settle();
  await page.screenshot({ path: `${outDir}/shop-cart.png` });

  await page.goto(`${base}/checkout`);
  await page.getByTestId('summary-item').first().waitFor();
  await settle();
  await page.getByTestId('place-order').click(); // show the validation messages
  await page.getByTestId('error-name').waitFor();
  await page.screenshot({ path: `${outDir}/shop-checkout-validation.png` });
  await page.getByTestId('checkout-name').fill('Alex Demo');
  await page.getByTestId('checkout-email').fill('alex.demo@example.test');
  await page.getByTestId('checkout-address').fill('1 Test Street');
  await page.getByTestId('checkout-city').fill('Testville');
  await page.getByTestId('checkout-postal-code').fill('12345');
  await page.getByTestId('place-order').click();
  await page.getByTestId('order-number').waitFor();
  await settle();
  await page.screenshot({ path: `${outDir}/shop-confirmation.png` });

  // The two HTML reports.
  for (const [folder, name, port] of [['reports/html', 'report-passing', 9401], ['reports/html-bugs', 'report-seeded-bugs', 9402]]) {
    if (!existsSync(folder)) { console.log(`Skipped ${name}: ${folder} does not exist`); continue; }
    const server = await serveFolder(folder, port);
    const reportPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await reportPage.goto(`http://localhost:${port}/`);
    await reportPage.getByText(/Total time/i).first().waitFor({ timeout: 15_000 }).catch(() => {});
    await reportPage.waitForTimeout(800);
    // Error messages contain the full path of this computer (C:\Users\<name>\...): shorten it before every screenshot.
    const hidePaths = () =>
      reportPage.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          node.textContent = node.textContent.replace(/[A-Za-z]:\\Users\\[^\\]+\\.*?(?=tests\\)/g, '…\\');
        }
      });
    await hidePaths();
    await reportPage.screenshot({ path: `${outDir}/${name}.png` });
    if (name === 'report-seeded-bugs') {
      // Open one failed test to show its error, screenshot and trace attachments.
      const failed = reportPage.getByRole('link', { name: /CART-UI-005/ }).first();
      if (await failed.count()) {
        await failed.click();
        await reportPage.waitForTimeout(1200);
        await hidePaths();
        await reportPage.screenshot({ path: `${outDir}/report-failure-detail.png` });
      }
    }
    await reportPage.close();
    server.close();
  }
  console.log('Screenshots written to', outDir);
} finally {
  await browser.close();
  if (userId) await deleteUserAndOrders(userId);
  await closePool();
  app.kill();
}

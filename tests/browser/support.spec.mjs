import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createPublicWebsite } from '../../apps/web/dist/index.js';
let server,
  origin,
  reports = [],
  limited = false;
const receiptKeys = new Map();
const web = createPublicWebsite({
  entities: { search: async () => [], byPublicId: async () => null, bySlug: async () => null },
  alternatives: { list: async () => [], preferred: async () => null },
  reasons: { list: async () => [], version: async () => 1, byCode: async () => null },
});
test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    response.setHeader(
      'content-security-policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; frame-ancestors 'none'",
    );
    if (request.method === 'GET' && !url.pathname.startsWith('/admin/')) {
      const result = await web(url.pathname, Object.fromEntries(url.searchParams));
      if (result?.kind === 'html') {
        response.setHeader('Content-Type', 'text/html');
        response.end(result.html);
        return;
      }
      if (result?.kind === 'asset') {
        response.setHeader('Content-Type', result.contentType);
        response.end(result.body);
        return;
      }
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
    response.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/api/v1/submissions') {
      if (limited) {
        response.statusCode = 429;
        response.setHeader('Retry-After', '10');
        response.end('{"error":"rate_limited"}');
        return;
      }
      if (receiptKeys.has(body.clientRequestId)) {
        response.statusCode = 202;
        response.end(JSON.stringify(receiptKeys.get(body.clientRequestId)));
        return;
      }
      const id = randomUUID();
      reports.push({
        id,
        revision: 0,
        type: body.submissionType,
        queue: 'product',
        state: 'pending',
        narrative: body.narrative,
        sourceUrls: body.sourceUrls,
        submittedAt: new Date().toISOString(),
        similarCount: 0,
      });
      const receipt = { id, state: 'pending' };
      receiptKeys.set(body.clientRequestId, receipt);
      response.statusCode = 202;
      response.end(JSON.stringify(receipt));
      return;
    }
    if (url.pathname.startsWith('/admin/')) {
      if (request.headers.authorization !== 'Bearer ' + 'a'.repeat(40)) {
        response.statusCode = 401;
        response.end('{}');
        return;
      }
      if (url.pathname.endsWith('/counts')) {
        response.end('{"counts":[]}');
        return;
      }
      if (url.pathname === '/admin/api/v1/feedback') {
        response.end(JSON.stringify({ reports, next: null }));
        return;
      }
      if (url.pathname.endsWith('/review')) {
        const record = reports.find((item) => item.id === url.pathname.split('/').at(-2));
        if (!record || body.expectedRevision !== record.revision) {
          response.statusCode = 409;
          response.end('{}');
          return;
        }
        record.revision++;
        record.state = body.state;
        response.end(JSON.stringify(record));
        return;
      }
      if (url.pathname.endsWith('/imports')) {
        response.end('{"batches":[]}');
        return;
      }
      if (url.pathname.endsWith('/membership-proposals')) {
        response.end('{"proposals":[]}');
        return;
      }
      if (url.pathname.endsWith('/publication-issues')) {
        response.end('{"issues":[]}');
        return;
      }
    }
    response.statusCode = 404;
    response.end('{}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
});
test.afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});
test('feedback receipts, retry errors, literal untrusted text, editor review and lock', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin + '/report?type=bug-report');
  await expect(page.locator('#report-type option')).toHaveCount(12);
  await page
    .locator('#report-message')
    .fill('Synthetic bug <img src=x onerror="window.injection=true">');
  await page.getByRole('button', { name: 'Send for review' }).click();
  await expect(page.locator('[data-form-status]')).toContainText(
    'Saved to the product review inbox',
  );
  limited = true;
  await page.locator('#report-message').fill('Another synthetic report.');
  await page.getByRole('button', { name: 'Send for review' }).click();
  await expect(page.locator('[data-form-status]')).toContainText('10 seconds');
  await expect(page.locator('#report-message')).toHaveValue('Another synthetic report.');
  limited = false;
  await page.goto(origin + '/editor');
  await page.getByLabel('Editor access token').fill('a'.repeat(40));
  await page.getByRole('button', { name: 'Unlock workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Report inbox' })).toBeVisible();
  expect(await page.evaluate(() => globalThis.injection)).toBeUndefined();
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(page.locator('[data-editor-status]')).toContainText('review note');
  await page.getByLabel('Review note', { exact: true }).fill('Synthetic issue under review.');
  await page.getByRole('button', { name: 'Mark in review' }).click();
  await expect(page.locator('article')).toContainText('Saved: triaged');
  for (const name of ['Imports', 'Membership', 'Publication checks'])
    await page.getByRole('button', { name, exact: true }).click();
  await page.screenshot({ path: info.outputPath('editor-unlocked.png'), fullPage: true });
  await page.getByRole('button', { name: 'Lock workspace' }).click();
  await expect(page.getByLabel('Editor access token')).toBeVisible();
  expect(errors).toEqual([]);
});
for (const width of [375, 768, 1280])
  test('support layouts and keyboard navigation at ' + width + 'px', async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/report', '/help', '/editor', '/download', '/causes']) {
      await page.goto(origin + path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: info.outputPath((path === '/' ? 'home' : path.slice(1)) + '-' + width + '.png'),
        fullPage: true,
      });
    }
    await page.goto(origin + '/report');
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveText('Skip to content');
  });

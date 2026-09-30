import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const output = fileURLToPath(new URL('../test-results/', import.meta.url));
await mkdir(output, { recursive: true });
const batches = [{ id: 'a', name: '採購測試', exchangeRate: 1, isActive: true }, { id: 'b', name: '另一檔期', exchangeRate: 1, isActive: true }];
const item = (spec, quantity = 1) => ({ productId: 'tea', productName: '茶葉', spec, quantity, unitPrice: 100, originalUnitPrice: 100, totalPrice: 100 * quantity });
const orders = [
  { id: '1', batchId: 'a', customerName: '測試', items: [item('紅茶', 2), item('綠茶')], status: 'unpaid' },
  { id: '2', batchId: 'a', customerName: '測試', items: [item('烏龍茶')], status: 'cancelled' },
  { id: '3', batchId: 'b', customerName: '測試', items: [item('綠茶')], status: 'paid' }
].map(o => ({ ...o, createdAt: '2026-09-23T00:00:00Z', shippingMethod: '宅配', totalAmount: o.items.reduce((sum, i) => sum + i.totalPrice, 0) }));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true, isMobile: width < 768 });
    await context.addInitScript(({ batches, orders }) => {
      if (sessionStorage.getItem('seeded')) return;
      for (const [key, data] of Object.entries({ dg_batches: batches, dg_orders: orders, dg_products: [], dg_member_groups: [], dg_summary_checks_a: ['tea_紅茶', 'obsolete'], dg_summary_checks_b: ['tea_綠茶'] })) localStorage.setItem(key, JSON.stringify(data));
      localStorage.setItem('dg_active_batch_id', 'a');
      localStorage.setItem('dg_workspace_v2:guest', JSON.stringify({ data: { batches, orders, products: [], activeBatchId: 'a', memberGroups: [],
        costRate: 0.22, purchaseChecks: { a: ['tea_紅茶', 'obsolete'], b: ['tea_綠茶'] } }, dirty: false, baseVersion: 'null' }));
      sessionStorage.setItem('seeded', '1');
    }, { batches, orders });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:4173');
    await page.getByRole('button', { name: width < 768 ? '採購清單' : '採購彙整表', exact: true }).click();
    const filters = page.getByRole('group', { name: '採購狀態篩選' });
    await expect(filters.getByRole('button', { name: '全部（2）', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('checkbox')).toHaveCount(2);
    await expect(page.getByRole('checkbox', { name: '茶葉 紅茶 已購買' })).toBeChecked();
    await filters.getByRole('button', { name: '未購買（1）' }).click();
    await expect(page.getByRole('checkbox')).toHaveCount(1);
    await expect(page.getByRole('checkbox', { name: '茶葉 綠茶 已購買' })).not.toBeChecked();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '匯出未購買清單' }).click();
    const download = await downloadPromise;
    const rows = XLSX.utils.sheet_to_json(XLSX.readFile(await download.path()).Sheets['採購彙整']);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]['規格/款式'], '綠茶');
    assert.equal(rows[0]['採購狀態'], '未採購');
    await page.getByRole('checkbox', { name: '茶葉 綠茶 已購買' }).click();
    await expect(page.getByText('全部品項都已購買完成！', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '匯出未購買清單' })).toBeDisabled();
    await filters.getByRole('button', { name: '已購買（2）' }).click();
    await page.getByRole('checkbox', { name: '茶葉 紅茶 已購買' }).click();
    await expect(page.getByRole('checkbox')).toHaveCount(1);
    await filters.getByRole('button', { name: '未購買（1）' }).click();
    await expect(page.getByRole('checkbox', { name: '茶葉 紅茶 已購買' })).not.toBeChecked();
    await expect(page.getByTestId('accepted-sales').getByText('$300', { exact: true })).toBeVisible();
    await expect.poll(() => page.locator('nav').evaluate(el => getComputedStyle(el).position)).toBe('sticky');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await filters.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/purchase-filter-${width}.png` });
    await page.reload();
    await page.getByRole('button', { name: width < 768 ? '採購清單' : '採購彙整表', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: '茶葉 綠茶 已購買' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: '茶葉 紅茶 已購買' })).not.toBeChecked();
    // Switch batch while SummaryManager stays mounted via the real import UI.
    await page.locator('input[type="file"]').setInputFiles({ name: 'test-batch.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ batches, orders, products: [], activeBatchId: 'b', purchaseChecks: { b: ['tea_綠茶'] } })) });
    await expect(page.getByRole('heading', { name: '另一檔期 - 採購彙整表' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: '茶葉 綠茶 已購買' })).toBeChecked();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('dg_workspace_v2:guest')).data.purchaseChecks.b), ['tea_綠茶']);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`PASS ${width}px: saved checks, status filters/counts, check/uncheck, empty results, export, totals, reload and batch isolation`);
  }
} finally {
  await browser.close();
}

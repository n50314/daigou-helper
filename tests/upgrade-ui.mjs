import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { demoWorkspace } from '../services/demo.ts';

const baseURL = process.env.TEST_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const dataOf = page => page.evaluate(() => JSON.parse(localStorage.getItem('dg_workspace_v2:guest')).data);
const noOverflow = async page => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page fits viewport');
async function setup(width, seed) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, isMobile: width < 768, hasTouch: true });
  if (seed) await context.addInitScript(data => {
    if (sessionStorage.getItem('upgrade-seeded')) return;
    localStorage.setItem('dg_workspace_v2:guest', JSON.stringify({ data, dirty: false, baseVersion: 'null' }));
    sessionStorage.setItem('upgrade-seeded', '1');
  }, seed);
  const page = await context.newPage();
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('request', r => requests.push(r.url()));
  page.on('dialog', dialog => dialog.accept());
  await page.goto(baseURL);
  await expect(page.getByRole('heading', { name: '代購小幫手', exact: true })).toBeVisible();
  const tab = kind => page.getByRole('button', { name: kind === 'orders' ? '訂單管理' : kind === 'products' ? (width < 768 ? '商品設定' : '商品與檔期設定') : (width < 768 ? '採購清單' : '採購彙整表'), exact: true });
  return { context, page, errors, requests, tab };
}
try {
  for (const width of [390, 1440]) {
    const data = demoWorkspace();
    const orphanProduct = { id: 'orphan-product', batchId: 'removed-legacy-batch', name: '歷史商品', originalPrice: 1000, productType: 'normal' };
    const orphanOrder = { ...data.orders[0], id: 'orphan-order', batchId: 'removed-legacy-batch', customerName: '歷史客戶', items: [{ ...data.orders[0].items[0], productId: 'orphan-product', productName: '歷史成交品', quantity: 1, unitPrice: 240, originalUnitPrice: 1000, totalPrice: 240, spec: '舊款' }], totalAmount: 240 };
    data.products.push(orphanProduct); data.orders.push(orphanOrder);
    const { context, page, errors, requests, tab } = await setup(width, data);
    assert.equal(requests.some(url => /\/assets\/xlsx-/.test(url)), false, 'Excel code stays unloaded until export');
    await page.getByPlaceholder('輸入姓名').fill('未送出草稿');
    await page.locator('select').filter({ has: page.locator('option[value="demo-shirt"]') }).first().selectOption('demo-shirt');
    await page.getByLabel('尺寸或容量', { exact: true }).fill('M');
    await page.getByRole('button', { name: '加入清單', exact: true }).click();
    const switchBatch = id => page.getByLabel('目前檔期', { exact: true }).selectOption(id);
    await switchBatch('demo-tw'); await expect(page.getByPlaceholder('輸入姓名')).toHaveValue('');
    await expect(page.getByText('清單是空的', { exact: true })).toBeVisible();
    await switchBatch('demo-jp'); await expect(page.getByPlaceholder('輸入姓名')).toHaveValue('未送出草稿');
    await tab('products').click(); await tab('orders').click();
    await expect(page.getByPlaceholder('輸入姓名')).toHaveValue('未送出草稿');
    await page.reload(); await expect(page.getByPlaceholder('輸入姓名')).toHaveValue('未送出草稿');
    const beforeOrders = (await dataOf(page)).orders;
    await tab('products').click();
    await page.getByRole('button', { name: '編輯商品 純棉短袖上衣', exact: true }).click();
    await page.getByLabel('編輯商品名稱').fill('新版純棉上衣'); await page.getByLabel('編輯商品原價').fill('2000');
    await page.getByRole('button', { name: '儲存商品', exact: true }).click();
    assert.deepEqual((await dataOf(page)).orders, beforeOrders);
    await page.getByRole('button', { name: '分類與選項設定', exact: true }).click();
    await page.getByRole('button', { name: '刪除分類 服飾配件', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '移轉商品後刪除分類' })).toBeVisible();
    assert.ok((await dataOf(page)).productTypes.some(t => t.id === 'apparel'), 'No mutation before destination chosen');
    await page.getByLabel('移轉至分類').selectOption('normal');
    await page.getByRole('button', { name: '移轉並刪除分類', exact: true }).click();
    let next = await dataOf(page); assert.equal(next.products.find(p => p.id === 'demo-shirt').productType, 'normal'); assert.deepEqual(next.orders, beforeOrders);
    await page.getByRole('button', { name: '檔期與商品', exact: true }).click();
    await page.getByRole('button', { name: '移除檔期 日本生活選品・示範', exact: true }).click();
    next = await dataOf(page); assert.equal(next.batches[0].archived, true); assert.deepEqual(next.orders, beforeOrders);
    await tab('orders').click(); await expect(page.getByRole('button', { name: '送出訂單', exact: true })).toBeDisabled();
    await page.getByRole('searchbox', { name: '搜尋訂單' }).fill('示範客戶 A');
    await page.getByRole('button', { name: /^編輯(訂單)?$/ }).click();
    await page.getByLabel('編輯客戶姓名').fill('示範客戶 A 更新');
    await page.getByRole('button', { name: '儲存變更', exact: true }).click();
    const changed = (await dataOf(page)).orders.find(o => o.id === 'demo-order-0');
    assert.deepEqual(changed.items, data.orders[0].items); assert.equal(changed.totalAmount, data.orders[0].totalAmount);
    await tab('products').click();
    await page.getByRole('button', { name: '恢復檔期 日本生活選品・示範', exact: true }).click();
    await tab('orders').click(); await page.getByRole('button', { name: '送出訂單', exact: true }).click();
    const sent = (await dataOf(page)).orders.find(o => o.customerName === '未送出草稿');
    assert.equal(sent.batchId, 'demo-jp'); assert.equal(sent.items[0].unitPrice, 360); assert.equal(sent.items[0].productName, '純棉短袖上衣');
    await tab('summary').click(); await page.getByRole('spinbutton').fill('0.21'); await page.getByRole('spinbutton').blur();
    await switchBatch('demo-tw'); await expect(page.getByRole('spinbutton')).toHaveValue('1');
    await switchBatch('demo-jp'); await expect(page.getByRole('spinbutton')).toHaveValue('0.21');
    next = await dataOf(page); const malformed = structuredClone(next); malformed.orders[0].items[0].quantity = -1;
    await page.locator('input[type="file"]').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(malformed)) });
    assert.deepEqual(await dataOf(page), next, 'Invalid backup must not replace current data');
    await switchBatch('removed-legacy-batch'); await tab('orders').click();
    await expect(page.getByRole('status')).toHaveText('顯示 1 / 1 筆訂單（目前檔期）');
    await expect(page.getByRole('button', { name: '送出訂單', exact: true })).toBeDisabled();
    await tab('products').click(); await expect(page.getByText('歷史商品', { exact: true }).filter({ visible: true })).toBeVisible();
    await page.getByRole('button', { name: '編輯檔期 未歸檔歷史資料 1', exact: true }).click();
    await page.getByLabel('編輯檔期名稱').fill('修復的歷史檔期');
    await page.getByLabel('編輯售價換算率').fill('0.24'); await page.getByLabel('編輯成本匯率').fill('0.22');
    await page.getByRole('button', { name: '儲存檔期', exact: true }).click();
    next = await dataOf(page); assert.deepEqual(next.orders.find(o => o.id === 'orphan-order'), orphanOrder); assert.deepEqual(next.products.find(p => p.id === 'orphan-product'), orphanProduct);
    assert.ok(next.batches.some(b => b.id === 'removed-legacy-batch' && b.archived && !b.missingMetadata));
    await noOverflow(page); assert.deepEqual(errors, []); await context.close();
    console.log(`PASS ${width}px: scoped/reloaded drafts, editing preserves old prices, atomic category transfer, archive/restore, per-batch costs, rejected import, orphan recovery`);
  }
  const imagePath = fileURLToPath(new URL('../docs/images/', import.meta.url)); await mkdir(imagePath, { recursive: true });
  for (const width of [390, 1440]) {
    const { context, page, tab, errors } = await setup(width);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: '載入示範資料', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('顯示 3 / 3 筆訂單（目前檔期）');
    await page.getByRole('button', { name: '關閉通知', exact: true }).click();
    await expect(page.locator('.feedback-toast')).toHaveCount(0);
    await page.screenshot({ path: `${imagePath}/orders-${width}.png`, fullPage: true, animations: 'disabled' });
    await tab('products').click(); await noOverflow(page); await page.screenshot({ path: `${imagePath}/products-${width}.png`, fullPage: true, animations: 'disabled' });
    await tab('summary').click(); await noOverflow(page); await page.screenshot({ path: `${imagePath}/summary-${width}.png`, fullPage: true, animations: 'disabled' });
    assert.deepEqual(errors, []); await context.close();
  }
  console.log('PASS explicit guest demo and public screenshots contain synthetic data only');
} finally { await browser.close(); }

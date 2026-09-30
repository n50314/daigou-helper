import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import XLSX from 'xlsx';
import { fileURLToPath } from 'node:url';

const baseURL = process.env.TEST_URL || 'http://127.0.0.1:4173';
const output = fileURLToPath(new URL('../test-results/', import.meta.url));
await mkdir(output, { recursive: true });
const types = ['Uniqlo', '無印良品', '藥妝', '專櫃彩妝', '零食', '家電', '鞋包', '生活用品', '限定禮盒'].map((label, i) =>
  ({ id: `type-${i}`, label, color: 'blue', requiresMember: false, requiresSpecs: i === 2 }));
const batches = [{ id: 'test', name: '測試代購', exchangeRate: 0.25, isActive: true, allowedGroupIds: [] },
  { id: 'other', name: '其他檔期', exchangeRate: 1, isActive: true }];
const products = [
  { id: 'shirt', batchId: 'test', name: '紫色短T', originalPrice: 790, productType: 'type-0' },
  { id: 'cream', batchId: 'test', name: '保濕乳液', originalPrice: 1200, productType: 'type-2' }
];
const makeOrder = (id, customerName, product, spec, status = 'unpaid', batchId = 'test') => ({
  id, customerName, batchId, status, shippingMethod: '宅配', createdAt: '2026-09-22T12:00:00Z', totalAmount: 198,
  items: [{ productId: product.id, productName: product.name, quantity: 1, unitPrice: 198,
    originalUnitPrice: product.originalPrice, totalPrice: 198, spec }]
});
const orders = [makeOrder('order-alice', 'Alice 王小姐', products[0], '紫色 / M'),
  makeOrder('order-bob', 'Bob 林先生', products[1], '200ml', 'paid'),
  makeOrder('order-other', '其他客人', products[0], '紫色', 'unpaid', 'other')];
const fixture = {
  dg_batches: batches, dg_active_batch_id: 'test', dg_products: products, dg_orders: orders,
  dg_product_types: types, dg_member_groups: []
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
async function open(width, data) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true, isMobile: width < 768 });
  if (data) await context.addInitScript(data => {
    if (sessionStorage.getItem('fixture-loaded')) return;
    for (const [key, value] of Object.entries(data)) localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    localStorage.setItem('dg_workspace_v2:guest', JSON.stringify({ data: {
      batches: data.dg_batches, products: data.dg_products, orders: data.dg_orders, activeBatchId: data.dg_active_batch_id,
      memberGroups: data.dg_member_groups, productTypes: data.dg_product_types, costRate: 0.22, purchaseChecks: {}
    }, dirty: false, baseVersion: 'null' }));
    sessionStorage.setItem('fixture-loaded', '1');
  }, data);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseURL);
  await expect(page.getByRole('heading', { name: '代購小幫手', exact: true })).toBeVisible();
  // Verify bundled styles are applied before measuring layout.
  await expect.poll(() => page.locator('nav').evaluate(el => getComputedStyle(el).position)).toBe('sticky');
  return { context, page };
}
const visibleButton = (page, name) => page.getByRole('button', { name, exact: true }).filter({ visible: true });
const assertNoOverflow = async page => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page must fit viewport');

try {
  for (const width of [390, 768, 1440]) {
    const { context, page } = await open(width, fixture);
    await visibleButton(page, width < 768 ? '商品設定' : '商品與檔期設定').click();
    const strip = page.getByRole('group', { name: '商品類型', exact: true });
    await strip.scrollIntoViewIfNeeded();
    if (width < 1000) assert.ok(await strip.evaluate(el => el.scrollWidth > el.clientWidth));
    await expect(strip).toHaveCSS('overflow-x', 'auto');
    await assertNoOverflow(page);
    if (width === 390) {
      const box = await strip.boundingBox();
      const cdp = await context.newCDPSession(page);
      const x = box.x + box.width - 15, y = box.y + box.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 8; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - step * 25, y }] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect.poll(() => strip.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
      await cdp.detach();
    }
    await strip.getByRole('button', { name: '限定禮盒', exact: true }).click();
    await expect(strip.getByRole('button', { name: '限定禮盒', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByPlaceholder('輸入商品名稱').fill('綜合禮盒');
    await page.getByPlaceholder('$', { exact: true }).fill('1000');
    await page.locator('form').filter({ hasText: '新增商品' }).getByRole('button', { name: '新增', exact: true }).click();
    assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('dg_workspace_v2:guest')).data.products.some(p => p.name === '綜合禮盒' && p.productType === 'type-8')));
    await page.screenshot({ path: `${output}/products-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: '分類與選項設定', exact: true }).click();
    await assertNoOverflow(page);
    await expect(page.getByRole('heading', { name: '選項群組設定（選用）' })).toBeVisible();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('dg_workspace_v2:guest')).data.productTypes), types);

    await visibleButton(page, '訂單管理').click();
    const search = page.getByRole('searchbox', { name: '搜尋訂單' });
    for (const keyword of ['alice', 'ＡＬＩＣＥ', '紫色', 'order-alice', 'Alice 紫色', '200ml', '已付款']) {
      await search.fill(keyword);
      await expect(page.getByRole('status')).toHaveText('顯示 1 / 2 筆訂單（目前檔期）');
    }
    await search.fill('不存在');
    await expect(page.getByRole('status')).toHaveText('顯示 0 / 2 筆訂單（目前檔期）');
    await expect(visibleButton(page, '匯出搜尋結果')).toBeDisabled();
    await search.fill('宅配');
    await expect(page.getByRole('status')).toHaveText('顯示 2 / 2 筆訂單（目前檔期）');
    await search.fill('Alice');
    const downloadPromise = page.waitForEvent('download');
    await visibleButton(page, '匯出搜尋結果').click();
    const download = await downloadPromise;
    const sheet = XLSX.readFile(await download.path()).Sheets['訂單明細'];
    const rows = XLSX.utils.sheet_to_json(sheet);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]['客戶姓名'], 'Alice 王小姐');
    await page.screenshot({ path: `${output}/search-${width}.png`, fullPage: true });
    await visibleButton(page, '清除').click();

    const selector = page.locator('select').filter({ has: page.locator('option[value="shirt"]') }).first();
    await selector.selectOption('shirt');
    const quantity = page.getByRole('textbox', { name: '商品數量', exact: true });
    await quantity.fill('');
    await expect(quantity).toHaveValue('');
    await quantity.fill('2');
    await visibleButton(page, '加入清單').click();
    await page.getByPlaceholder('輸入姓名').fill('數量測試');
    await page.getByRole('button', { name: '送出訂單', exact: true }).click();
    const created = await page.evaluate(() => JSON.parse(localStorage.getItem('dg_workspace_v2:guest')).data.orders.find(o => o.customerName === '數量測試'));
    assert.equal(created.items[0].quantity, 2);
    assert.equal(created.totalAmount, 396);
    await search.fill('數量測試');
    await page.getByRole('button', { name: /^編輯(訂單)?$/ }).filter({ visible: true }).click();
    const editSelector = page.locator('select').filter({ has: page.locator('option[value="cream"]') }).last();
    await editSelector.selectOption('cream');
    await page.getByLabel('尺寸或容量', { exact: true }).fill('250ml');
    const editQty = page.getByRole('textbox', { name: '新增商品數量', exact: true });
    for (const invalid of ['', '0', '-1', '1.5', 'abc', '9007199254740992']) {
      await editQty.fill(invalid);
      const alertPromise = page.waitForEvent('dialog').then(async dialog => {
        assert.equal(dialog.message(), '請輸入大於 0 的整數數量');
        await dialog.accept();
      });
      await page.getByRole('button', { name: '加入訂單', exact: true }).click();
      await alertPromise;
    }
    await editQty.fill('3');
    await page.getByRole('button', { name: '加入訂單', exact: true }).click();
    await page.getByRole('button', { name: '儲存變更', exact: true }).click();
    const updated = await page.evaluate(() => JSON.parse(localStorage.getItem('dg_workspace_v2:guest')).data.orders.find(o => o.customerName === '數量測試'));
    assert.equal(updated.items[1].quantity, 3);
    assert.equal(updated.items[1].spec, '250ml');
    assert.equal(updated.totalAmount, 1296);
    await assertNoOverflow(page);
    await page.reload();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('dg_workspace_v2:guest')).data.memberGroups), []);
    await context.close();
    console.log(`PASS ${width}px: touch/overflow, type selection, search/export, create/edit quantity, arbitrary specs, persistence`);
  }

  const fresh = await open(390);
  const freshData = await fresh.page.evaluate(() => ({ types: JSON.parse(localStorage.getItem('dg_workspace_v2:guest')).data.productTypes, groups: JSON.parse(localStorage.getItem('dg_workspace_v2:guest')).data.memberGroups }));
  assert.deepEqual(freshData.groups, []);
  assert.ok(freshData.types.every(t => !t.requiresMember));
  assert.ok(freshData.types.some(t => t.label === '食品零食'));
  await fresh.context.close();

  const legacyGroups = [{ id: 'old-group', name: '既有團體', subgroups: [{ name: '一期', members: ['既有成員'] }] }];
  const legacyTypes = [{ id: 'photo', label: '生寫真', color: 'yellow', requiresMember: true, requiresSpecs: false }];
  const legacyProduct = { ...products[0], productType: 'photo' };
  const legacy = await open(390, { ...fixture, dg_member_groups: legacyGroups, dg_product_types: legacyTypes, dg_products: [legacyProduct] });
  await legacy.page.locator('select').filter({ has: legacy.page.locator('option[value="shirt"]') }).selectOption('shirt');
  await expect(legacy.page.locator('option').filter({ hasText: '既有成員' })).toHaveCount(1);
  assert.deepEqual(await legacy.page.evaluate(() => JSON.parse(localStorage.getItem('dg_workspace_v2:guest')).data.memberGroups), legacyGroups);
  assert.deepEqual(await legacy.page.evaluate(() => JSON.parse(localStorage.getItem('dg_workspace_v2:guest')).data.productTypes), legacyTypes);
  await legacy.context.close();
  const imported = await open(390);
  imported.page.on('dialog', dialog => dialog.accept());
  await imported.page.locator('input[type="file"]').setInputFiles({
    name: 'legacy-backup.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ batches, products: [legacyProduct], orders: [], activeBatchId: 'test' }))
  });
  await expect.poll(() => imported.page.evaluate(() => JSON.parse(localStorage.getItem('dg_workspace_v2:guest')).data.productTypes.some(t => t.id === 'photo'))).toBe(true);
  assert.ok(await imported.page.evaluate(() => JSON.parse(localStorage.getItem('dg_workspace_v2:guest')).data.memberGroups.length > 0));
  await imported.context.close();
  assert.deepEqual(errors, []);
  console.log('PASS fresh general defaults, preserved legacy classification, no uncaught browser errors');
} finally {
  await browser.close();
}

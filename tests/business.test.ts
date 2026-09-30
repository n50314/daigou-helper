import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyWorkspace, normalizeWorkspace } from '../services/workspaceData.ts';
import { validateWorkspaceImport, currencyOf, costRateOf, categoryLabel } from '../services/catalog.ts';
import { accessibleBatches, removeOrArchiveBatch, transferCategory, batchTotals } from '../services/business.ts';
import { draftKey, readDraft } from '../services/orderDraft.ts';
import { demoWorkspace } from '../services/demo.ts';

test('legacy order snapshots, IDs, categories and variants survive normalization unchanged', () => {
  const legacy = demoWorkspace();
  delete legacy.batches[0].currency; delete legacy.batches[0].costRate;
  legacy.productTypes = [{ id: 'photo', label: '生寫真', color: 'yellow', requiresMember: true, requiresSpecs: false }];
  legacy.products[0].productType = 'photo'; legacy.orders[0].items[0].spec = '既有選項';
  const before = JSON.stringify(legacy); const result = normalizeWorkspace(legacy);
  assert.deepEqual(result.orders, legacy.orders); assert.deepEqual(result.products, legacy.products); assert.deepEqual(result.batches, legacy.batches);
  assert.equal(JSON.stringify(legacy), before); assert.equal(currencyOf(result.batches[0]), 'JPY'); assert.equal(costRateOf(result.batches[0], 0.22), 0.22);
  assert.equal(categoryLabel(result.productTypes[0]), '紙品收藏'); assert.equal(result.productTypes[0].label, '生寫真');
});

test('archiving an occupied batch preserves every order and product and its selected ID', () => {
  const data = demoWorkspace(); const next = removeOrArchiveBatch(data, 'demo-jp');
  assert.equal(next.batches.find(b => b.id === 'demo-jp')?.archived, true); assert.equal(next.activeBatchId, 'demo-jp');
  assert.strictEqual(next.orders, data.orders); assert.strictEqual(next.products, data.products);
  assert.equal(data.batches[0].archived, undefined);
});

test('removing an empty selected batch selects an available batch atomically', () => {
  const data = demoWorkspace(); data.batches.push({ id: 'empty', name: '空', exchangeRate: 1, isActive: true }); data.activeBatchId = 'empty';
  const next = removeOrArchiveBatch(data, 'empty'); assert.ok(!next.batches.some(b => b.id === 'empty')); assert.equal(next.activeBatchId, 'demo-jp'); assert.deepEqual(next.orders, data.orders);
});

test('category transfer includes archived products but never changes old order snapshots', () => {
  const data = demoWorkspace(); data.products[0].archived = true;
  const next = transferCategory(data, 'apparel', 'normal'); assert.equal(next.products[0].productType, 'normal'); assert.equal(next.products[0].archived, true);
  assert.ok(!next.productTypes.some(t => t.id === 'apparel')); assert.strictEqual(next.orders, data.orders);
  assert.throws(() => transferCategory(data, 'apparel', 'missing')); assert.throws(() => transferCategory(data, 'apparel', 'apparel'));
});

test('changing catalog price or sales rate never reprices historical orders', () => {
  const data = demoWorkspace(); const oldOrders = structuredClone(data.orders);
  data.products[0].name = '新版名稱'; data.products[0].originalPrice = 9999; data.batches[0].exchangeRate = 5;
  assert.deepEqual(normalizeWorkspace(data).orders, oldOrders);
});

test('imports reject negative amounts, fractional quantities and inconsistent totals before replacement', () => {
  const good = demoWorkspace(); validateWorkspaceImport(good);
  for (const mutate of [(d: any) => d.products[0].originalPrice = -1, (d: any) => d.orders[0].items[0].quantity = 1.5,
    (d: any) => d.orders[0].items[0].unitPrice = -1, (d: any) => d.orders[0].totalAmount += 1,
    (d: any) => d.batches[0].exchangeRate = 0, (d: any) => d.products.push(d.products[0]), (d: any) => d.orders[0].status = 'unknown']) {
    const invalid = structuredClone(good); mutate(invalid); assert.throws(() => validateWorkspaceImport(invalid));
  }
  assert.deepEqual(good, demoWorkspace());
});

test('historical orders remain importable when their product was deleted', () => {
  const data = demoWorkspace(); data.products = []; validateWorkspaceImport(data);
  assert.equal(batchTotals(data.orders, 'demo-jp', 0.22).sales, 1656);
});

test('paid and unpaid totals exclude cancellations while procurement includes all other states', () => {
  const data = demoWorkspace(); const cancelled = { ...data.orders[0], id: 'cancelled', status: 'cancelled' as const, totalAmount: 999 };
  const totals = batchTotals([...data.orders, cancelled], 'demo-jp', 0.22);
  assert.equal(totals.sales, 1656); assert.equal(totals.paid, 1368); assert.equal(totals.unpaid, 288); assert.equal(totals.originalCost, 6900); assert.equal(totals.grossProfit, 138);
  assert.equal(costRateOf(data.batches[1], 0.22), 1);
});

test('draft keys separate accounts, guests and batches; corrupt drafts are never silently treated as empty', () => {
  const keys = [draftKey('A', 'one'), draftKey('B', 'one'), draftKey('A', 'two'), draftKey(null, 'one')]; assert.equal(new Set(keys).size, 4);
  const draft = { customerName: '草稿', shippingMethod: '宅配', cart: demoWorkspace().orders[0].items };
  const storage = { getItem: (key: string) => key === keys[0] ? JSON.stringify(draft) : null } as Storage;
  assert.deepEqual(readDraft(storage, keys[0]), draft); assert.equal(readDraft(storage, keys[1]).cart.length, 0);
  assert.throws(() => readDraft({ getItem: () => '{bad' } as unknown as Storage, 'x'));
});

test('new workspaces use general categories and explicit local demo data', () => {
  assert.equal(emptyWorkspace().orders.length, 0); assert.equal(emptyWorkspace().memberGroups.length, 0);
  assert.ok(emptyWorkspace().productTypes.every(t => !t.requiresMember)); assert.equal(emptyWorkspace().batches[0].currency, 'TWD');
  assert.ok(demoWorkspace().orders.every(o => o.customerName.startsWith('示範')));
});

test('orphaned historical batches are discoverable without changing or assigning any existing data', () => {
  const data = demoWorkspace(); data.orders[0].batchId = 'removed-batch'; const before = JSON.stringify(data);
  const visible = accessibleBatches(data); const recovered = visible.find(b => b.id === 'removed-batch');
  assert.equal(recovered?.missingMetadata, true); assert.equal(recovered?.archived, true); assert.equal(recovered?.exchangeRate, 0);
  assert.equal(JSON.stringify(data), before); assert.ok(!data.batches.some(b => b.id === 'removed-batch'));
});

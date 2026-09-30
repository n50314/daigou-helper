import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceSync } from '../services/workspaceSync.ts';
import { emptyWorkspace, normalizeWorkspace, versionOf, workspaceKey, preserveLegacyStorage } from '../services/workspaceData.ts';

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}
const data = (name: string) => ({ ...emptyWorkspace(), batches: [{ id: name, name, exchangeRate: 1, isActive: true }], activeBatchId: name });
function harness(uid = 'A', storage = new MemoryStorage()) {
  let next: any; let error: any; const saves: any[] = [];
  const adapter = { watch: (_uid: string, callback: any, failure: any) => { next = callback; error = failure; return () => {}; },
    save: async (_uid: string, value: any, expected: string) => { saves.push({ uid: _uid, value, expected }); return { ...value, revision: 'saved' }; } };
  const sync = new WorkspaceSync(uid, storage as any, adapter, () => {}, 100000);
  sync.start();
  return { sync, saves, adapter, next: (raw: any) => next(raw), error: (e: Error) => error(e), storage };
}

test('never uploads browser data before the first server snapshot; ignores device clocks', async () => {
  const h = harness(); h.storage.setItem('dg_orders', '["foreign"]');
  h.sync.update(() => data('must-not-save')); await h.sync.flush(); assert.equal(h.saves.length, 0);
  h.next({ ...data('A-cloud'), lastUpdated: 1 });
  assert.equal(h.sync.view.data.activeBatchId, 'A-cloud'); assert.equal(h.saves.length, 0);
  h.next({ ...data('new-server-content'), lastUpdated: 0 });
  assert.equal(h.sync.view.data.activeBatchId, 'new-server-content');
  h.sync.stop();
});
test('switching A to B cancels pending writes and isolates cache and late callbacks', async () => {
  const a = harness(); a.next(data('A')); a.sync.update(() => data('A-edit')); a.sync.stop();
  const b = harness('B', a.storage); b.next(data('B'));
  a.next(data('late-A')); await a.sync.flush();
  assert.equal(a.saves.length, 0); assert.equal(b.sync.view.data.activeBatchId, 'B');
  assert.equal(JSON.parse(a.storage.getItem(workspaceKey('A'))!).data.activeBatchId, 'A-edit');
  assert.equal(JSON.parse(a.storage.getItem(workspaceKey('B'))!).data.activeBatchId, 'B'); b.sync.stop();
});
test('new empty account does not inherit another account or automatically write defaults', () => {
  const h = harness(); h.next(null);
  assert.equal(h.sync.view.editable, true); assert.equal(h.saves.length, 0); assert.equal(h.sync.view.data.orders.length, 0); h.sync.stop();
});
test('remote change while locally dirty preserves draft and blocks overwrite', async () => {
  const h = harness(); h.next(data('original')); h.sync.update(() => data('draft')); h.next(data('other-device'));
  assert.equal(h.sync.view.status, 'conflict'); await h.sync.flush(); assert.equal(h.saves.length, 0);
  assert.equal(h.sync.view.data.activeBatchId, 'draft'); h.sync.reloadFromCloud(true); h.next(data('other-device'));
  assert.equal(h.sync.view.data.activeBatchId, 'other-device');
  assert.ok([...h.storage.values.keys()].some(k => k.includes(':backup:'))); h.sync.stop();
});
test('changes during an in-flight save remain dirty and are saved next', async () => {
  const h = harness(); h.next(data('original'));
  let resolve: any; h.adapter.save = async () => new Promise(r => { resolve = r; });
  h.sync.update(() => data('first')); const pending = h.sync.flush(); h.sync.update(() => data('second'));
  h.next({ ...data('first'), revision: 'one' }); resolve({ ...data('first'), revision: 'one' }); await pending;
  assert.equal(h.sync.view.data.activeBatchId, 'second'); assert.equal(h.sync.dirty, true); assert.equal(h.sync.view.status, 'pending'); h.sync.stop();
});
test('read or transaction failures stop writes and never report saved', async () => {
  const h = harness(); h.error(new Error('offline')); assert.equal(h.sync.view.editable, false); await h.sync.flush(); assert.equal(h.saves.length, 0);
  h.next(data('A')); h.sync.update(() => data('draft'));
  h.adapter.save = async () => { throw Object.assign(new Error('conflict'), { code: 'sync/conflict' }); };
  await h.sync.flush(); assert.equal(h.sync.view.status, 'conflict'); assert.equal(h.sync.dirty, true); h.sync.stop();
});
test('own pending cache resumes only against its exact server baseline', () => {
  const s = new MemoryStorage(); s.setItem(workspaceKey('A'), JSON.stringify({ data: data('draft'), dirty: true, baseVersion: versionOf(data('base')) }));
  const h = harness('A', s); h.next(data('base')); assert.equal(h.sync.view.data.activeBatchId, 'draft'); assert.equal(h.sync.view.status, 'pending'); h.sync.stop();
});
test('normalization preserves purchase checks, empty selections and removes undefined fields', () => {
  const value = normalizeWorkspace({ ...data('A'), batches: [{...data('A').batches[0], allowedGroupIds: undefined}],
    checks: { dg_summary_checks_A: '["tea"]' }, costRate: '0.25', memberGroups: [] });
  assert.deepEqual(value.purchaseChecks, { A: ['tea'] }); assert.equal(value.costRate, 0.25);
  assert.ok(!Object.hasOwn(value.batches[0], 'allowedGroupIds'));
});

test('unreadable guest cache is preserved verbatim and editing remains blocked', () => {
  const storage = new MemoryStorage(); storage.setItem(workspaceKey(null), '{corrupt');
  const sync = new WorkspaceSync(null, storage as any, { watch: () => () => {}, save: async () => ({}) }, () => {});
  sync.start(); sync.update(() => data('replacement')); assert.equal(storage.getItem(workspaceKey(null)), '{corrupt'); assert.equal(sync.view.editable, false); sync.stop();
});

test('unreadable authenticated cache is archived before accepting the authoritative snapshot without uploading', () => {
  const storage = new MemoryStorage(); storage.setItem(workspaceKey('A'), '{corrupt'); const h = harness('A', storage);
  h.next(data('cloud')); assert.equal(h.sync.view.data.activeBatchId, 'cloud'); assert.equal(h.saves.length, 0);
  assert.ok([...storage.values.entries()].some(([key, value]) => key.includes(':backup:') && value === '{corrupt')); h.sync.stop();
});

test('backup failure blocks replacement and preserves original content', () => {
  const storage = new MemoryStorage(); storage.setItem(workspaceKey('A'), JSON.stringify({ data: data('cached'), dirty: false }));
  const original = storage.getItem(workspaceKey('A')); storage.setItem = () => { throw new Error('quota'); };
  const h = harness('A', storage); h.next(data('cloud')); assert.equal(h.sync.view.editable, false); assert.equal(h.sync.view.data.activeBatchId, 'cached');
  assert.equal(storage.getItem(workspaceKey('A')), original); assert.equal(h.saves.length, 0); h.sync.stop();
});

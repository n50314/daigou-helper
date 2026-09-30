import type { WorkspaceData } from './workspaceData.ts';
import type { Order, Batch } from '../types.ts';

export function accessibleBatches(data: WorkspaceData): Batch[] {
  const ids = new Set(data.batches.map(b => b.id));
  const missing = [...new Set([...data.orders, ...data.products].map(row => row.batchId).filter(id => id && !ids.has(id)))];
  return [...data.batches, ...missing.map((id, index) => ({ id, name: `未歸檔歷史資料 ${index + 1}`, exchangeRate: 0, currency: 'JPY', archived: true, isActive: false, missingMetadata: true }))];
}

export function removeOrArchiveBatch(data: WorkspaceData, id: string): WorkspaceData {
  const used = data.orders.some(o => o.batchId === id) || data.products.some(p => p.batchId === id);
  if (used) return { ...data, batches: data.batches.map(b => b.id === id ? { ...b, archived: true } : b) };
  const batches = data.batches.filter(b => b.id !== id);
  return { ...data, batches, activeBatchId: data.activeBatchId === id ? batches.find(b => !b.archived)?.id || batches[0]?.id || '' : data.activeBatchId };
}
export function transferCategory(data: WorkspaceData, source: string, target: string): WorkspaceData {
  if (source === target || !data.productTypes.some(t => t.id === target) || data.productTypes.length < 2) throw new Error('請選擇另一個有效分類');
  return { ...data, products: data.products.map(p => p.productType === source ? { ...p, productType: target } : p), productTypes: data.productTypes.filter(t => t.id !== source) };
}
export function batchTotals(orders: Order[], batchId: string, costRate: number) {
  const accepted = orders.filter(o => o.batchId === batchId && o.status !== 'cancelled');
  const sales = accepted.reduce((sum, o) => sum + o.totalAmount, 0);
  const paid = accepted.filter(o => ['paid', 'shipping', 'completed'].includes(o.status)).reduce((sum, o) => sum + o.totalAmount, 0);
  const unpaid = accepted.filter(o => o.status === 'unpaid').reduce((sum, o) => sum + o.totalAmount, 0);
  const originalCost = accepted.flatMap(o => o.items).reduce((sum, i) => sum + i.originalUnitPrice * i.quantity, 0);
  return { accepted, sales, paid, unpaid, originalCost, estimatedCost: originalCost * costRate, grossProfit: sales - originalCost * costRate };
}

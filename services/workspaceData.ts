import type { Product, Order, Batch, MemberGroup, ProductTypeConfig } from '../types.ts';

// Migration Data: Original Sakurazaka Members
export const DEFAULT_GROUPS: MemberGroup[] = [
  {
    id: 'sakurazaka46',
    name: '櫻坂46',
    subgroups: [

      {
        name: '二期生',
        members: ['井上梨名', '遠藤光莉', '大園玲', '大沼晶保', '幸阪茉里乃', '武元唯衣', '田村保乃', '藤吉夏鈴', '増本綺良', '松田里奈', '森田ひかる', '守屋麗奈', '山﨑天']
      },
      {
        name: '三期生',
        members: ['石森璃花', '遠藤理子', '小田倉麗奈', '小島凪紗', '谷口愛季', '中嶋優月', '的野美青', '向井純葉', '村井優', '村山美羽', '山下瞳月']
      },
      {
        name: '四期生',
        members: ['浅井恋乃未', '稲熊ひな', '勝又春', '佐藤愛桜', '中川智尋', '松本和子', '目黒陽色', '山川宇衣', '山田桃実']
      }
    ]
  }
];

export const LEGACY_PRODUCT_TYPES: ProductTypeConfig[] = [
  { id: 'normal', label: '一般商品', color: 'slate', requiresMember: false, requiresSpecs: true },
  { id: 'member', label: '成員商品', color: 'pink', requiresMember: true, requiresSpecs: false },
  { id: 'photo', label: '生寫真', color: 'yellow', requiresMember: true, requiresSpecs: false }
];
export const hasLegacyProducts = (items: Product[]) => items.some(p => p.productType === 'member' || p.productType === 'photo');

export interface WorkspaceData {
  batches: Batch[];
  products: Product[];
  orders: Order[];
  activeBatchId: string;
  memberGroups: MemberGroup[];
  productTypes: ProductTypeConfig[];
  costRate: number;
  purchaseChecks: Record<string, string[]>;
}

export const GENERAL_TYPES: ProductTypeConfig[] = [
  { id: 'normal', label: '一般商品', color: 'slate', requiresMember: false, requiresSpecs: false },
  { id: 'apparel', label: '服飾配件', color: 'blue', requiresMember: false, requiresSpecs: true },
  { id: 'beauty', label: '美妝保養', color: 'pink', requiresMember: false, requiresSpecs: true },
  { id: 'food', label: '食品零食', color: 'orange', requiresMember: false, requiresSpecs: false },
  { id: 'household', label: '生活用品', color: 'green', requiresMember: false, requiresSpecs: false },
  { id: 'electronics', label: '3C配件', color: 'blue', requiresMember: false, requiresSpecs: true },
  { id: 'stationery', label: '文具紙品', color: 'slate', requiresMember: false, requiresSpecs: false }
];

export function emptyWorkspace(): WorkspaceData {
  return { batches: [{ id: 'default-batch', name: '預設檔期', exchangeRate: 1, currency: 'TWD', costRate: 1, isActive: true }],
    products: [], orders: [], activeBatchId: 'default-batch', memberGroups: [], productTypes: GENERAL_TYPES,
    costRate: 1, purchaseChecks: {} };
}

export function normalizeWorkspace(raw: any): WorkspaceData {
  if (!raw || !['batches', 'products', 'orders'].every(key => Array.isArray(raw[key]))) {
    throw new Error('資料格式不完整，已停止同步以保留原資料。');
  }
  const purchaseChecks: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(raw.purchaseChecks || {})) {
    if (Array.isArray(value)) purchaseChecks[key] = value.filter(v => typeof v === 'string');
  }
  // Support explicitly imported legacy JSON backups without assigning them to an account automatically.
  for (const [key, value] of Object.entries(raw.checks || {})) {
    if (!key.startsWith('dg_summary_checks_')) continue;
    const list = typeof value === 'string' ? JSON.parse(value) : value;
    if (Array.isArray(list)) purchaseChecks[key.slice('dg_summary_checks_'.length)] = list.filter(v => typeof v === 'string');
  }
  const costRate = raw.costRate === undefined ? 0.22 : Number(raw.costRate);
  if (!Number.isFinite(costRate) || costRate < 0) throw new Error('成本匯率格式錯誤');
  // JSON serialization removes optional undefined fields that Firestore rejects.
  return JSON.parse(JSON.stringify({ batches: raw.batches, products: raw.products, orders: raw.orders,
    activeBatchId: raw.batches.some((b: Batch) => b.id === raw.activeBatchId) ? raw.activeBatchId : raw.batches[0]?.id || '',
    memberGroups: Array.isArray(raw.memberGroups) ? raw.memberGroups : hasLegacyProducts(raw.products) ? DEFAULT_GROUPS : [],
    productTypes: Array.isArray(raw.productTypes) ? raw.productTypes : hasLegacyProducts(raw.products) ? LEGACY_PRODUCT_TYPES : GENERAL_TYPES,
    costRate, purchaseChecks }));
}

export function versionOf(raw: unknown): string {
  const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) :
    value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return JSON.stringify(canonical(raw));
}

export const workspaceKey = (uid: string | null) => `dg_workspace_v2:${uid ? `user:${uid}` : 'guest'}`;

export function preserveLegacyStorage(storage: Storage): void {
  if (storage.getItem('dg_legacy_backup_v2')) return;
  const keys = ['dg_batches', 'dg_products', 'dg_orders', 'dg_active_batch_id', 'dg_member_groups', 'dg_product_types', 'dg_cost_rate'];
  const checks = Object.keys(storage).filter(key => key.startsWith('dg_summary_checks_'));
  const entries = Object.fromEntries([...keys, ...checks].flatMap(key => {
    const value = storage.getItem(key);
    return value === null ? [] : [[key, value]];
  }));
  if (Object.keys(entries).length) storage.setItem('dg_legacy_backup_v2', JSON.stringify(entries));
}

export function legacyBackup(storage: Storage): Record<string, unknown> | null {
  const saved = storage.getItem('dg_legacy_backup_v2');
  if (!saved) return null;
  const entries = JSON.parse(saved);
  return { batches: JSON.parse(entries.dg_batches || '[]'), products: JSON.parse(entries.dg_products || '[]'),
    orders: JSON.parse(entries.dg_orders || '[]'), activeBatchId: entries.dg_active_batch_id || '',
    ...(entries.dg_member_groups ? { memberGroups: JSON.parse(entries.dg_member_groups) } : {}),
    ...(entries.dg_product_types ? { productTypes: JSON.parse(entries.dg_product_types) } : {}),
    costRate: entries.dg_cost_rate || '0.22', checks: Object.fromEntries(Object.entries(entries).filter(([key]) => key.startsWith('dg_summary_checks_'))) };
}

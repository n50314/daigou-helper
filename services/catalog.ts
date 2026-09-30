import type { Batch, ProductTypeConfig } from '../types.ts';

export const CURRENCIES = [
  ['JPY', '日圓 JPY'], ['TWD', '台幣 TWD'], ['USD', '美元 USD'],
  ['KRW', '韓元 KRW'], ['EUR', '歐元 EUR'], ['CNY', '人民幣 CNY'], ['HKD', '港幣 HKD'],
] as const;
export const currencyOf = (batch?: Batch) => batch?.currency || 'JPY';
export const costRateOf = (batch: Batch | undefined, legacyRate: number) => batch?.costRate ?? legacyRate;
export const validRate = (value: number) => Number.isFinite(value) && value > 0;
export const categoryLabel = (type?: ProductTypeConfig) => {
  if (!type) return '其他商品';
  if (type.id === 'member' && type.label === '成員商品') return '指定款式商品';
  if (type.id === 'photo' && type.label === '生寫真') return '紙品收藏';
  return type.label;
};

export function validateWorkspaceImport(data: any): void {
  const fail = (message: string): never => { throw new Error(`匯入未完成：${message}，目前資料未更動。`); };
  const number = (value: unknown, title: string, positive = false) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || (positive ? value <= 0 : value < 0)) fail(`${title}必須是${positive ? '大於 0' : '非負'}的有效數字`);
  };
  for (const key of ['batches', 'products', 'orders', 'productTypes', 'memberGroups']) {
    if (!Array.isArray(data[key])) fail(`${key}格式錯誤`);
    const seen = new Set();
    for (const row of data[key]) {
      if (!row || typeof row.id !== 'string' || !row.id.trim() || seen.has(row.id)) fail(`${key}有缺少或重複的編號`);
      seen.add(row.id);
    }
  }
  for (const batch of data.batches) {
    if (typeof batch.name !== 'string' || !batch.name.trim()) fail('檔期名稱不可空白');
    number(batch.exchangeRate, '售價換算率', true);
    if (batch.costRate !== undefined) number(batch.costRate, '成本匯率', true);
  }
  for (const product of data.products) {
    if (typeof product.name !== 'string' || !product.name.trim()) fail('商品名稱不可空白');
    number(product.originalPrice, '商品原價');
    if (typeof product.batchId !== 'string' || typeof product.productType !== 'string') fail('商品缺少檔期或分類編號');
    if (product.note !== undefined && typeof product.note !== 'string') fail('商品備註格式錯誤');
  }
  for (const type of data.productTypes) {
    if (typeof type.label !== 'string' || !type.label.trim() || typeof type.color !== 'string' || typeof type.requiresSpecs !== 'boolean' || typeof type.requiresMember !== 'boolean') fail('分類設定格式錯誤');
  }
  for (const group of data.memberGroups) {
    if (typeof group.name !== 'string' || !Array.isArray(group.subgroups)) fail('選項群組格式錯誤');
    for (const sub of group.subgroups) if (!sub || typeof sub.name !== 'string' || !Array.isArray(sub.members) || sub.members.some((m: any) => typeof m !== 'string')) fail('款式選項格式錯誤');
  }
  for (const order of data.orders) {
    if (typeof order.customerName !== 'string' || !order.customerName.trim()) fail('客戶名稱不可空白');
    if (typeof order.batchId !== 'string' || typeof order.createdAt !== 'string' || !Number.isFinite(Date.parse(order.createdAt)) || typeof order.shippingMethod !== 'string') fail('訂單檔期、日期或配送方式格式錯誤');
    if (!['unpaid', 'paid', 'shipping', 'completed', 'cancelled'].includes(order.status)) fail('訂單狀態無法辨識');
    if (!Array.isArray(order.items) || !order.items.length) fail('訂單缺少品項');
    for (const item of order.items) {
      if (!item || typeof item.productId !== 'string' || typeof item.productName !== 'string' || (item.spec !== undefined && typeof item.spec !== 'string')) fail('訂單品項格式錯誤');
      if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) fail('商品數量必須是正整數');
      number(item.unitPrice, '成交單價'); number(item.originalUnitPrice, '商品成本'); number(item.totalPrice, '品項金額');
      if (Math.abs(item.totalPrice - item.unitPrice * item.quantity) > 0.01) fail('品項金額與數量、單價不一致');
    }
    number(order.totalAmount, '訂單總額');
    if (Math.abs(order.totalAmount - order.items.reduce((sum: number, item: any) => sum + item.totalPrice, 0)) > 0.01) fail('訂單總額與品項金額不一致');
  }
  number(data.costRate, '成本匯率');
}

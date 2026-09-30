import type { CartItem, ShippingMethod } from '../types.ts';
import { SHIPPING_METHODS } from '../types.ts';

export interface OrderDraft { customerName: string; shippingMethod: ShippingMethod; cart: CartItem[] }
export const blankDraft = (): OrderDraft => ({ customerName: '', shippingMethod: '賣貨便', cart: [] });
export const draftKey = (uid: string | null, batchId: string) => `dg_order_draft_v1:${uid ? `user:${uid}` : 'guest'}:${batchId}`;
export function readDraft(storage: Storage, key: string): OrderDraft {
  const raw = storage.getItem(key);
  if (!raw) return blankDraft();
  const value = JSON.parse(raw);
  if (!value || typeof value.customerName !== 'string' || !SHIPPING_METHODS.includes(value.shippingMethod) || !Array.isArray(value.cart) || value.cart.some((item: any) =>
    !item || typeof item.productId !== 'string' || typeof item.productName !== 'string' || !Number.isSafeInteger(item.quantity) || item.quantity < 1 ||
    ![item.unitPrice, item.originalUnitPrice, item.totalPrice].every(number => typeof number === 'number' && Number.isFinite(number) && number >= 0))) throw new Error('草稿格式無法讀取');
  return value;
}

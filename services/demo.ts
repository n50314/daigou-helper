import { emptyWorkspace } from './workspaceData.ts';
import type { WorkspaceData } from './workspaceData.ts';

// Explicitly loaded into the guest workspace only. No real customers or orders.
export function demoWorkspace(): WorkspaceData {
  const data = emptyWorkspace();
  data.batches = [{ id: 'demo-jp', name: '日本生活選品・示範', exchangeRate: 0.24, costRate: 0.22, currency: 'JPY', isActive: true },
    { id: 'demo-tw', name: '台灣日用品・示範', exchangeRate: 1, costRate: 1, currency: 'TWD', isActive: true }];
  data.activeBatchId = 'demo-jp';
  data.products = [
    { id: 'demo-shirt', batchId: 'demo-jp', name: '純棉短袖上衣', originalPrice: 1500, productType: 'apparel', note: '下單請指定尺寸與顏色' },
    { id: 'demo-lotion', batchId: 'demo-jp', name: '保濕乳液', originalPrice: 1200, productType: 'beauty', note: '可填容量或版本' },
    { id: 'demo-cookie', batchId: 'demo-jp', name: '奶油餅乾禮盒', originalPrice: 900, productType: 'food' },
    { id: 'demo-cup', batchId: 'demo-jp', name: '保溫隨行杯', originalPrice: 2000, productType: 'household' },
    { id: 'demo-cable', batchId: 'demo-jp', name: 'USB-C 充電線', originalPrice: 800, productType: 'electronics' },
    { id: 'demo-book', batchId: 'demo-jp', name: '方格筆記本', originalPrice: 450, productType: 'stationery' },
    { id: 'demo-box', batchId: 'demo-tw', name: '桌面收納盒', originalPrice: 180, productType: 'household' }
  ];
  const entries = [['demo-shirt', '米白 / M', 2, 'paid'], ['demo-lotion', '200ml', 1, 'unpaid'], ['demo-cookie', '', 3, 'shipping']] as const;
  data.orders = entries.map(([id, spec, quantity, status], index) => {
    const p = data.products.find(p => p.id === id)!;
    const unitPrice = Math.ceil(p.originalPrice * 0.24);
    return { id: `demo-order-${index}`, batchId: 'demo-jp', customerName: `示範客戶 ${['A', 'B', 'C'][index]}`, status,
      shippingMethod: '宅配', createdAt: '2026-09-30T00:00:00Z', totalAmount: unitPrice * quantity,
      items: [{ productId: p.id, productName: p.name, spec, quantity, unitPrice, originalUnitPrice: p.originalPrice, totalPrice: unitPrice * quantity }] };
  });
  return data;
}

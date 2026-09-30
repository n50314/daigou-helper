import { Order } from '../types';

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'unpaid': return '待付款';
    case 'paid': return '已付款';
    case 'shipping': return '待出貨';
    case 'completed': return '已完成';
    case 'cancelled': return '已取消';
    default: return status;
  }
};

export const exportOrdersToExcel = async (orders: Order[], batchName: string) => {
  const XLSX = await import('xlsx');
  const data = orders.map(order => {
    // Format: "Product Name (Spec) xQty"
    const itemsSummary = order.items
      .map(item => `${item.productName}${item.spec ? ` (${item.spec})` : ''} x${item.quantity}`)
      .join(', ');

    return {
      '訂單編號': order.id.slice(0, 8),
      '建立日期': new Date(order.createdAt).toLocaleDateString('zh-TW'),
      '客戶姓名': order.customerName,
      '訂購商品': itemsSummary,
      '出貨方式': order.shippingMethod,
      '訂單總額 (TWD)': order.totalAmount,
      '狀態': getStatusLabel(order.status)
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "訂單明細");

  const fileName = `訂單_${batchName}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};

export const exportSummaryToExcel = async (summaryData: any[], batchName: string) => {
  const XLSX = await import('xlsx');
  const worksheet = XLSX.utils.json_to_sheet(summaryData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "採購彙整");

  const fileName = `採購清單_${batchName}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};

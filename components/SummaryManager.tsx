import React, { useMemo, useState, useEffect } from 'react';
import type { Order, Batch } from '../types';
import { Download, CheckSquare, Square, ClipboardList } from 'lucide-react';
import { exportSummaryToExcel } from '../services/excelService';
import { batchTotals } from '../services/business';
import { currencyOf, validRate } from '../services/catalog';

interface SummaryManagerProps {
  orders: Order[];
  activeBatch: Batch | undefined;
  costRate: number;
  setCostRate: (rate: number) => void;
  checkedKeys: string[];
  onCheckedKeysChange: (keys: string[]) => void;
  canUpdateRate?: boolean;
}
interface PurchaseItem { key: string; name: string; spec: string; count: number; totalSales: number }

const SummaryManager: React.FC<SummaryManagerProps> = ({ orders, activeBatch, costRate, setCostRate, checkedKeys, onCheckedKeysChange, canUpdateRate = true }) => {
  const [filter, setFilter] = useState<'all' | 'unchecked' | 'checked'>('all');
  const [rateText, setRateText] = useState(String(costRate));
  useEffect(() => setRateText(String(costRate)), [costRate]);
  const totals = useMemo(() => batchTotals(orders, activeBatch?.id || '', costRate), [orders, activeBatch?.id, costRate]);
  const items = useMemo(() => {
    const result = new Map<string, PurchaseItem>();
    for (const order of totals.accepted) for (const item of order.items) {
      // Preserve the key format used by all existing purchase checklists.
      const key = `${item.productId}_${item.spec || 'default'}`;
      const row = result.get(key) || { key, name: item.productName, spec: item.spec || '', count: 0, totalSales: 0 };
      row.count += item.quantity; row.totalSales += item.totalPrice; result.set(key, row);
    }
    return [...result.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-TW') || a.spec.localeCompare(b.spec, 'zh-TW'));
  }, [totals.accepted]);
  const checked = new Set(checkedKeys);
  const checkedCount = items.filter(i => checked.has(i.key)).length;
  const visibleItems = items.filter(i => filter === 'all' || (filter === 'checked' ? checked.has(i.key) : !checked.has(i.key)));
  const toggle = (key: string) => onCheckedKeysChange(checked.has(key) ? checkedKeys.filter(k => k !== key) : [...checkedKeys, key]);
  const exportLabel = filter === 'unchecked' ? '匯出未購買清單' : filter === 'checked' ? '匯出已購買清單' : '匯出採購清單';
  const exportRows = () => {
    if (!activeBatch) return;
    void exportSummaryToExcel(visibleItems.map(i => ({ '商品名稱': i.name, '規格/款式': i.spec || '-', '總數量': i.count, '台幣銷售總額': i.totalSales, '採購狀態': checked.has(i.key) ? '已採購' : '未採購' })), activeBatch.name).catch(() => alert('匯出失敗，請重試。'));
  };
  const money = (value: number) => `$${Math.round(value).toLocaleString('zh-TW')}`;
  const checkbox = (item: PurchaseItem) => <button type="button" role="checkbox" aria-checked={checked.has(item.key)} aria-label={`${item.name}${item.spec ? ` ${item.spec}` : ''} 已購買`} onClick={() => toggle(item.key)} className={`min-w-11 min-h-11 flex items-center justify-center rounded-lg border ${checked.has(item.key) ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 text-slate-400'}`}>
    {checked.has(item.key) ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
  </button>;
  if (!activeBatch) return <p className="p-8 bg-white rounded-xl text-center text-slate-500">請先選擇檔期。</p>;
  return <div className="space-y-6">
    <div className="flex flex-wrap justify-between gap-3 items-center">
      <h2 className="manager-title text-xl font-bold flex items-center gap-2"><ClipboardList className="w-5 h-5 text-blue-600" />{activeBatch.name} - 採購彙整表</h2>
      <button disabled={!visibleItems.length} onClick={exportRows} className="px-4 py-2 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 text-sm flex gap-2 items-center disabled:opacity-40"><Download className="w-4 h-4" />{exportLabel}</button>
    </div>
    <div className="metric-grid bg-white border border-slate-200 rounded-xl">
      <div data-testid="accepted-sales"><p className="text-sm text-slate-500 mb-2">接單金額（TWD）</p><strong>{money(totals.sales)}</strong><p className="text-xs text-slate-400 mt-2">{totals.accepted.length} 筆有效訂單</p></div>
      <div><p className="text-sm text-slate-500 mb-2">已標記付款（TWD）</p><strong>{money(totals.paid)}</strong><p className="text-xs text-slate-400 mt-2">已付款、待出貨、已完成</p></div>
      <div><p className="text-sm text-slate-500 mb-2">待付款金額（TWD）</p><strong>{money(totals.unpaid)}</strong><p className="text-xs text-slate-400 mt-2">待付款訂單</p></div>
      <div><p className="text-sm text-slate-500 mb-2">預估商品毛利（TWD）</p><strong className={totals.grossProfit < 0 ? 'text-red-600' : 'text-blue-600'}>{money(totals.grossProfit)}</strong><p className="text-xs text-slate-400 mt-2">未扣運費與其他費用</p></div>
    </div>
    <div className="bg-white p-4 border border-slate-200 rounded-xl flex flex-wrap items-center gap-3 text-sm">
      <label htmlFor="cost-rate" className="text-slate-600">此檔期成本匯率（{currencyOf(activeBatch)} → TWD）</label>
      <input id="cost-rate" type="number" disabled={!canUpdateRate} min="0.000001" step="any" value={rateText} onChange={e => setRateText(e.target.value)} onBlur={() => {
        if (validRate(Number(rateText))) setCostRate(Number(rateText)); else { alert('成本匯率須大於 0，目前匯率未更動。'); setRateText(String(costRate)); }
      }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} className="w-28 px-3 py-2 border border-slate-300 rounded-lg" />
      <span className="text-slate-500">商品原價合計 {currencyOf(activeBatch)} {totals.originalCost.toLocaleString()} · 預估商品成本 TWD {Math.round(totals.estimatedCost).toLocaleString()}</span>
    </div>
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-slate-200 space-y-4">
        <div className="flex flex-wrap gap-3 justify-between items-center"><div><h3 className="font-bold">採購進度</h3><p className="text-sm text-slate-500 mt-1">{checkedCount} / {items.length} 項已購買 · {items.reduce((sum, i) => sum + i.count, 0)} 件商品</p></div><p className="text-xs text-slate-500">待付款訂單也會納入；已取消訂單不計。</p></div>
        <div className="h-1 bg-slate-100 rounded-full overflow-hidden" aria-label="採購完成比例"><div className="h-full bg-blue-600" style={{ width: `${items.length ? checkedCount / items.length * 100 : 0}%` }} /></div>
        <div role="group" aria-label="採購狀態篩選" className="flex flex-wrap gap-2">{([['all', '全部', items.length], ['unchecked', '未購買', items.length - checkedCount], ['checked', '已購買', checkedCount]] as const).map(([id, label, count]) =>
          <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)} className={`px-4 py-2 text-sm rounded-lg border ${filter === id ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{label}（{count}）</button>
        )}</div>
      </div>
      {!visibleItems.length ? <p className="p-10 text-center text-sm text-slate-500">{!items.length ? '此檔期尚無需要採購的訂單。' : filter === 'unchecked' ? '全部品項都已購買完成！' : '尚無已購買品項。'}</p> : <>
        <div className="md:hidden divide-y divide-slate-100">{visibleItems.map(item => <article key={item.key} className="p-4 flex items-start gap-3">
          {checkbox(item)}<div className="min-w-0 flex-1"><h4 className="font-medium break-words">{item.name}</h4>{item.spec && <p className="text-sm text-slate-500 mt-1 break-words">{item.spec}</p>}<p className="text-sm text-slate-500 mt-3">銷售合計 TWD {item.totalSales.toLocaleString()}</p></div>
          <div className="text-right shrink-0"><strong className="text-2xl text-blue-600">{item.count}</strong><span className="block text-xs text-slate-500">件</span></div>
        </article>)}</div>
        <div className="hidden md:block overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-4 w-20">已購買</th><th className="p-4">商品名稱</th><th className="p-4">規格／款式</th><th className="p-4 text-right">數量</th><th className="p-4 text-right whitespace-nowrap">銷售合計（TWD）</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleItems.map(item => <tr key={item.key} className={checked.has(item.key) ? 'bg-slate-50' : ''}><td className="p-4">{checkbox(item)}</td><td className="p-4 font-medium">{item.name}</td><td className="p-4 text-slate-500">{item.spec || '—'}</td><td className="p-4 text-right text-lg font-bold text-blue-600">{item.count}</td><td className="p-4 text-right">{item.totalSales.toLocaleString()}</td></tr>)}</tbody></table></div>
      </>}
    </section>
  </div>;
};
export default SummaryManager;

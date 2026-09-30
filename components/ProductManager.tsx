import React, { useState, useEffect } from 'react';
import { Product, Order, Batch, ProductTypeConfig, MemberGroup, TYPE_COLORS } from '../types';
import { Plus, Trash2, Archive, CheckCircle, Calculator, Tag, AlertTriangle, Users, Settings as SettingsIcon, X, Palette, Lock, ChevronDown, ChevronRight, Pencil, Save, XCircle } from 'lucide-react';

interface ProductManagerProps {
  orders: Order[];
  legacyCostRate: number;
  onRemoveBatch: (id: string) => void;
  onTransferCategory: (source: string, target: string) => void;
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  batches: Batch[];
  setBatches: React.Dispatch<React.SetStateAction<Batch[]>>;
  activeBatchId: string;
  setActiveBatchId: (id: string) => void;
  memberGroups: MemberGroup[];
  setMemberGroups: React.Dispatch<React.SetStateAction<MemberGroup[]>>;
  productTypes: ProductTypeConfig[];
  setProductTypes: React.Dispatch<React.SetStateAction<ProductTypeConfig[]>>;
}

import { GENERAL_TYPES, versionOf } from '../services/workspaceData';
import { CURRENCIES, categoryLabel, currencyOf, costRateOf, validRate } from '../services/catalog';

const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

// Color Translation Map
const COLOR_NAMES: Record<string, string> = {
  slate: '灰色 (預設)',
  red: '紅色',
  orange: '橘色',
  yellow: '黃色',
  green: '綠色',
  blue: '藍色',
  purple: '紫色',
  pink: '粉色',
};

// --- Internal Component: Group Item (Handles Collapse & Inline Edit) ---
const GroupItem = ({
    group,
    onUpdate,
    onDelete
}: {
    group: MemberGroup;
    onUpdate: (g: MemberGroup) => void;
    onDelete: (id: string) => void;
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [newSubgroupName, setNewSubgroupName] = useState('');
    const [newMemberInputs, setNewMemberInputs] = useState<Record<number, string>>({}); // Index -> Value

    const handleAddSubgroup = () => {
        if (!newSubgroupName.trim()) return;
        const updated = {
            ...group,
            subgroups: [...group.subgroups, { name: newSubgroupName, members: [] }]
        };
        onUpdate(updated);
        setNewSubgroupName('');
    };

    const handleRemoveSubgroup = (idx: number) => {
        if(window.confirm('確定刪除此分組？')) {
            const updated = {
                ...group,
                subgroups: group.subgroups.filter((_, i) => i !== idx)
            };
            onUpdate(updated);
        }
    };

    const handleAddMember = (subIdx: number) => {
        const val = newMemberInputs[subIdx];
        if (!val || !val.trim()) return;

        const newMembers = val.split(/[,\uff0c]/).map(s => s.trim()).filter(Boolean);
        const newSubgroups = [...group.subgroups];
        newSubgroups[subIdx] = {
            ...newSubgroups[subIdx],
            members: [...newSubgroups[subIdx].members, ...newMembers]
        };

        onUpdate({ ...group, subgroups: newSubgroups });
        setNewMemberInputs(prev => ({ ...prev, [subIdx]: '' }));
    };

    const handleRemoveMember = (subIdx: number, memberName: string) => {
        if(!window.confirm(`移除選項 ${memberName}?`)) return;
        const newSubgroups = [...group.subgroups];
        newSubgroups[subIdx] = {
            ...newSubgroups[subIdx],
            members: newSubgroups[subIdx].members.filter(m => m !== memberName)
        };
        onUpdate({ ...group, subgroups: newSubgroups });
    };

    return (
        <div className="border border-slate-200 rounded-lg bg-slate-50 overflow-hidden transition-all">
            <div
                className="flex justify-between items-center p-4 bg-white cursor-pointer hover:bg-slate-50"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
                    <h3 className="font-bold text-slate-800 text-lg">{group.name}</h3>
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                        {group.subgroups.length} 個分組
                    </span>
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(group.id); }}
                    className="text-slate-300 hover:text-red-500 p-2 hover:bg-red-50 rounded-full transition-colors"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>

            {isExpanded && (
                <div className="p-4 border-t border-slate-200 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    {group.subgroups.map((sub, idx) => (
                        <div key={idx} className="bg-white p-3 rounded border border-slate-200 shadow-sm">
                            <div className="flex justify-between items-center mb-2 border-b border-slate-50 pb-2">
                                <span className="font-bold text-sm text-slate-700 flex items-center gap-2">
                                    {sub.name}
                                </span>
                                <button onClick={() => handleRemoveSubgroup(idx)} className="text-slate-300 hover:text-red-400 p-1">
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </div>

                            <div className="flex flex-wrap gap-2 mb-3">
                                {sub.members.map(member => (
                                    <span key={member} className="inline-flex items-center gap-1 bg-blue-50 px-2 py-1 rounded text-xs text-blue-700 border border-blue-100">
                                        {member}
                                        <button onClick={() => handleRemoveMember(idx, member)} className="text-blue-300 hover:text-red-500"><X className="w-3 h-3"/></button>
                                    </span>
                                ))}
                                {sub.members.length === 0 && <span className="text-xs text-slate-300 italic">無選項</span>}
                            </div>

                            {/* Inline Add Member */}
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="新增選項（逗號分隔多個）"
                                    className="min-w-0 flex-1 px-2 py-1 text-xs border border-slate-200 rounded focus:border-blue-500 outline-none"
                                    value={newMemberInputs[idx] || ''}
                                    onChange={(e) => setNewMemberInputs(prev => ({ ...prev, [idx]: e.target.value }))}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddMember(idx)}
                                />
                                <button
                                    onClick={() => handleAddMember(idx)}
                                    className="bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 px-2 py-1 rounded text-xs border border-slate-200 transition-colors"
                                >
                                    <Plus className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                    ))}

                    {/* Inline Add Subgroup */}
                    <div className="flex gap-2 mt-4 pt-4 border-t border-slate-200 border-dashed">
                         <input
                            type="text"
                            placeholder="新增分組（例：保養、彩妝）"
                            className="min-w-0 flex-1 px-3 py-2 text-sm border border-slate-300 rounded focus:border-blue-500 outline-none"
                            value={newSubgroupName}
                            onChange={(e) => setNewSubgroupName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddSubgroup()}
                         />
                         <button
                            onClick={handleAddSubgroup}
                            className="bg-slate-800 text-white px-4 py-2 rounded text-sm hover:bg-slate-900 flex items-center gap-1"
                         >
                             <Plus className="w-4 h-4" /> 新增分組
                         </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const ProductManager: React.FC<ProductManagerProps> = ({
  products, setProducts, batches, setBatches, activeBatchId, setActiveBatchId,
  memberGroups, setMemberGroups, productTypes, setProductTypes, orders, legacyCostRate, onRemoveBatch, onTransferCategory
}) => {
  const [tab, setTab] = useState<'batches' | 'settings'>('batches');
  const [batchName, setBatchName] = useState('');
  const [batchCurrency, setBatchCurrency] = useState('TWD');
  const [batchRate, setBatchRate] = useState('1');
  const [batchCost, setBatchCost] = useState('1');
  const [editBatch, setEditBatch] = useState<Batch | null>(null);
  const [batchBaseline, setBatchBaseline] = useState<Batch | null>(null);
  const [productName, setProductName] = useState('');
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [typeId, setTypeId] = useState(productTypes[0]?.id || '');
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [productBaseline, setProductBaseline] = useState<Product | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [typeName, setTypeName] = useState('');
  const [typeSpecs, setTypeSpecs] = useState(false);
  const [typeOptions, setTypeOptions] = useState(false);
  const [typeColor, setTypeColor] = useState('slate');
  const [transferSource, setTransferSource] = useState('');
  const [transferTarget, setTransferTarget] = useState('');
  useEffect(() => { if (!productTypes.some(t => t.id === typeId)) setTypeId(productTypes[0]?.id || ''); }, [productTypes, typeId]);
  const activeBatch = batches.find(b => b.id === activeBatchId);
  const currentProducts = products.filter(p => p.batchId === activeBatchId);
  const shownProducts = currentProducts.filter(p => showArchived || !p.archived);
  const duplicate = (name: string, skip?: string) => currentProducts.some(p => p.id !== skip && p.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase());
  const inputClass = 'w-full min-w-0 px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm';
  const primary = 'px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-40';
  const secondary = 'px-3 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50';
  const addBatch = (event: React.FormEvent) => {
    event.preventDefault();
    if (!batchName.trim() || !validRate(Number(batchRate)) || !validRate(Number(batchCost))) { alert('請填寫檔期名稱與大於 0 的匯率'); return; }
    const batch: Batch = { id: generateId(), name: batchName.trim(), exchangeRate: Number(batchRate), costRate: Number(batchCost), currency: batchCurrency, isActive: true };
    setBatches(prev => [batch, ...prev]); setActiveBatchId(batch.id); setBatchName('');
  };
  const removeBatch = (batch: Batch) => {
    const used = products.some(p => p.batchId === batch.id) || orders.some(o => o.batchId === batch.id);
    if (confirm(used ? `封存「${batch.name}」？商品與既有訂單會保留，可隨時恢復。` : `刪除空檔期「${batch.name}」？`)) onRemoveBatch(batch.id);
  };
  const saveBatch = () => {
    if (editBatch && versionOf(batches.find(b => b.id === editBatch.id)) !== versionOf(batchBaseline)) { alert('檔期已被其他視窗更新，已停止覆蓋。請核對輸入後關閉並重新編輯。'); return; }
    if (!editBatch || !editBatch.name.trim() || !validRate(editBatch.exchangeRate) || !validRate(costRateOf(editBatch, legacyCostRate))) { alert('請填寫名稱與有效匯率'); return; }
    const { missingMetadata, ...saved } = editBatch;
    const updated = { ...saved, name: saved.name.trim() };
    setBatches(prev => prev.some(b => b.id === updated.id) ? prev.map(b => b.id === updated.id ? updated : b) : [...prev, updated]); setEditBatch(null);
  };
  const addProduct = (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeBatch || activeBatch.archived || !productName.trim() || price.trim() === '' || !Number.isFinite(Number(price)) || Number(price) < 0) { alert('請填寫商品名稱與非負價格'); return; }
    if (duplicate(productName)) { alert('此檔期已有同名商品，可使用編輯功能'); return; }
    if (!productTypes.some(t => t.id === typeId)) { alert('請先建立商品分類'); return; }
    setProducts(prev => [{ id: generateId(), batchId: activeBatch.id, name: productName.trim(), originalPrice: Number(price), productType: typeId, note: note.trim() }, ...prev]);
    setProductName(''); setPrice(''); setNote('');
  };
  const saveProduct = () => {
    if (editProduct && versionOf(products.find(p => p.id === editProduct.id)) !== versionOf(productBaseline)) { alert('商品已被其他視窗更新，已停止覆蓋。請核對輸入後關閉並重新編輯。'); return; }
    if (!editProduct || !editProduct.name.trim() || !Number.isFinite(editProduct.originalPrice) || editProduct.originalPrice < 0) { alert('請填寫名稱與非負價格'); return; }
    if (duplicate(editProduct.name, editProduct.id)) { alert('此檔期已有同名商品'); return; }
    setProducts(prev => prev.map(p => p.id === editProduct.id ? { ...editProduct, name: editProduct.name.trim(), note: editProduct.note?.trim() || '' } : p)); setEditProduct(null);
  };
  const removeProduct = (p: Product) => {
    const used = orders.some(o => o.items.some(i => i.productId === p.id));
    if (!confirm(used ? `封存「${p.name}」？既有訂單不受影響，新訂單將不再顯示此商品。` : `刪除「${p.name}」？`)) return;
    setProducts(prev => used ? prev.map(item => item.id === p.id ? { ...item, archived: true } : item) : prev.filter(item => item.id !== p.id));
  };
  const removeType = (id: string) => {
    if (productTypes.length < 2) { alert('請保留至少一個商品分類'); return; }
    const used = products.filter(p => p.productType === id).length;
    if (used) { setTransferSource(id); setTransferTarget(''); return; }
    if (confirm('確定刪除此未使用的分類？')) setProductTypes(prev => prev.filter(t => t.id !== id));
  };
  const batchHasData = editBatch && (products.some(p => p.batchId === editBatch.id) || orders.some(o => o.batchId === editBatch.id));
  const productActions = (p: Product) => <div className="flex flex-wrap gap-2 justify-end">
    <button aria-label={`編輯商品 ${p.name}`} onClick={() => { setProductBaseline(p); setEditProduct({ ...p }); }} className={secondary}><Pencil className="w-4 h-4 inline mr-1" />編輯</button>
    {p.archived ? <button className={secondary} onClick={() => setProducts(prev => prev.map(item => item.id === p.id ? { ...item, archived: false } : item))}>恢復商品</button> :
      <button aria-label={`移除商品 ${p.name}`} className={`${secondary} text-red-600`} onClick={() => removeProduct(p)}><Trash2 className="w-4 h-4 inline" /></button>}
  </div>;
  return <div className="space-y-6">
    <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      <button onClick={() => setTab('batches')} className={tab === 'batches' ? primary : secondary}>檔期與商品</button>
      <button onClick={() => setTab('settings')} className={tab === 'settings' ? primary : secondary}>分類與選項設定</button>
    </div>
    {tab === 'settings' ? <div className="grid lg:grid-cols-2 gap-6">
      <section className="bg-white p-4 md:p-6 border border-slate-200 rounded-xl min-w-0">
        <h2 className="manager-title text-lg font-bold mb-3">商品類型設定</h2>
        <p className="text-sm text-slate-500 mb-4">一般商品也可選填規格。勾選「必填規格」後，下單需填尺寸、容量或款式。</p>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <input aria-label="新分類名稱" placeholder="新增分類（例：食品、生活用品）" className={inputClass} value={typeName} onChange={e => setTypeName(e.target.value)} />
          <select aria-label="分類標籤顏色" className={inputClass} value={typeColor} onChange={e => setTypeColor(e.target.value)}>{Object.entries(COLOR_NAMES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
        </div>
        <div className="flex flex-wrap items-center gap-4 mb-4 text-sm">
          <label className="flex gap-2 items-center"><input type="checkbox" checked={typeSpecs} onChange={e => setTypeSpecs(e.target.checked)} />必填規格</label>
          <label className="flex gap-2 items-center"><input type="checkbox" checked={typeOptions} onChange={e => setTypeOptions(e.target.checked)} />使用款式選項群組</label>
          <button className={primary} onClick={() => {
            if (!typeName.trim()) return;
            if (productTypes.some(t => categoryLabel(t) === typeName.trim())) { alert('已有同名分類'); return; }
            setProductTypes(prev => [...prev, { id: generateId(), label: typeName.trim(), color: typeColor, requiresMember: typeOptions, requiresSpecs: typeSpecs }]); setTypeName('');
          }}>新增分類</button>
        </div>
        <button className={`${secondary} mb-4 text-blue-600`} onClick={() => setProductTypes(prev => [...prev, ...GENERAL_TYPES.filter(type => !prev.some(t => t.id === type.id || t.label === type.label))])}>加入一般代購分類</button>
        <div className="divide-y divide-slate-100">{productTypes.map(type => <div key={type.id} className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0"><span className={`inline-block px-2 py-1 rounded text-sm border ${TYPE_COLORS[type.color] || TYPE_COLORS.slate}`}>{categoryLabel(type)}</span>
            <p className="text-xs text-slate-500 mt-1">{products.filter(p => p.productType === type.id).length} 件商品 · {type.requiresSpecs ? '規格必填' : '規格選填'}{type.requiresMember ? ' · 款式選項' : ''}</p></div>
          <button className={secondary} aria-label={`刪除分類 ${categoryLabel(type)}`} onClick={() => removeType(type.id)}><Trash2 className="w-4 h-4 text-red-500" /></button>
        </div>)}</div>
      </section>
      <section className="bg-white p-4 md:p-6 border border-slate-200 rounded-xl min-w-0">
        <h2 className="manager-title text-lg font-bold mb-3">選項群組設定（選用）</h2>
        <p className="text-sm text-slate-500 mb-4">依品牌、系列或型號建立固定選項；已存在的選項與訂單規格會繼續保留。</p>
        <div className="flex gap-2 mb-5"><input placeholder="新增群組（例：品牌、系列）" className={inputClass} value={groupName} onChange={e => setGroupName(e.target.value)} />
          <button className={primary} onClick={() => { if (groupName.trim()) { setMemberGroups(prev => [...prev, { id: generateId(), name: groupName.trim(), subgroups: [] }]); setGroupName(''); } }}>新增</button></div>
        <div className="space-y-3">{memberGroups.map(group => <GroupItem key={group.id} group={group} onUpdate={updated => setMemberGroups(prev => prev.map(g => g.id === updated.id ? updated : g))} onDelete={id => {
          if (confirm('移除群組後，新訂單不再顯示此選項；歷史訂單的規格保持原樣。確定移除？')) setMemberGroups(prev => prev.filter(g => g.id !== id));
        }} />)}</div>
        {!memberGroups.length && <p className="p-6 text-center text-sm text-slate-500 border border-dashed rounded-lg">尚無群組。可直接在訂單填寫自由規格。</p>}
      </section>
    </div> : <div className="grid lg:grid-cols-12 gap-6 items-start">
      <section className="lg:col-span-4 space-y-4 min-w-0">
        <div className="bg-white p-4 md:p-6 border border-slate-200 rounded-xl">
          <h2 className="manager-title text-lg font-bold mb-4">檔期管理</h2>
          <div className="space-y-2 mb-5">{batches.map(batch => <div key={batch.id} className={`p-3 rounded-lg border ${batch.id === activeBatchId ? 'border-blue-500' : 'border-slate-200'}`}>
            <button className="text-left w-full min-h-11" onClick={() => setActiveBatchId(batch.id)}><span className="font-medium break-words">{batch.name}</span>{batch.archived && <span className="text-xs text-slate-500 ml-2">已封存</span>}
              <span className="block text-xs text-slate-500 mt-1">{currencyOf(batch)} · {batch.missingMetadata ? '售價匯率待核對' : `售價換算 ${batch.exchangeRate}`} · {orders.filter(o => o.batchId === batch.id).length} 筆訂單</span></button>
            <div className="flex flex-wrap gap-2 mt-2">
              <button aria-label={`編輯檔期 ${batch.name}`} className={secondary} onClick={() => { setBatchBaseline(batch); setEditBatch({ ...batch, currency: currencyOf(batch), costRate: batch.missingMetadata ? 0 : costRateOf(batch, legacyCostRate) }); }}>{batch.missingMetadata ? '修復檔期' : '編輯檔期'}</button>
              {batch.missingMetadata ? null : batch.archived ? <button className={secondary} aria-label={`恢復檔期 ${batch.name}`} onClick={() => setBatches(prev => prev.map(b => b.id === batch.id ? { ...b, archived: false } : b))}>恢復檔期</button> :
                <button aria-label={`移除檔期 ${batch.name}`} className={secondary} onClick={() => removeBatch(batch)}>{products.some(p => p.batchId === batch.id) || orders.some(o => o.batchId === batch.id) ? '封存' : '刪除'}</button>}
            </div>
          </div>)}</div>
          <form onSubmit={addBatch} className="space-y-3 border-t pt-4">
            <h3 className="font-medium text-sm">建立新檔期</h3>
            <input aria-label="新檔期名稱" placeholder="例：日本生活選品 10 月" value={batchName} onChange={e => setBatchName(e.target.value)} className={inputClass} required />
            <label className="block text-sm text-slate-600">商品幣別<select aria-label="新檔期幣別" value={batchCurrency} onChange={e => setBatchCurrency(e.target.value)} className={`${inputClass} mt-1`}>{CURRENCIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm text-slate-600">售價換算率<input aria-label="新檔期售價換算率" type="number" min="0.000001" step="any" value={batchRate} onChange={e => setBatchRate(e.target.value)} className={`${inputClass} mt-1`} required /></label>
              <label className="text-sm text-slate-600">成本匯率<input aria-label="新檔期成本匯率" type="number" min="0.000001" step="any" value={batchCost} onChange={e => setBatchCost(e.target.value)} className={`${inputClass} mt-1`} required /></label>
            </div>
            <p className="text-xs text-slate-500">每 1 單位商品幣別換成的台幣金額。請自行設定售價與實際換匯成本。</p>
            <button className={`${primary} w-full`} type="submit">建立檔期</button>
          </form>
        </div>
      </section>
      <section className="lg:col-span-8 min-w-0 space-y-4">
        <form onSubmit={addProduct} className="bg-white p-4 md:p-6 border border-slate-200 rounded-xl space-y-4">
          <h2 className="manager-title text-lg font-bold">新增商品</h2>
          <fieldset disabled={!activeBatch || !!activeBatch.archived} className="space-y-4 min-w-0">
            <div role="group" aria-label="商品類型" className="flex flex-nowrap gap-2 overflow-x-auto pb-2 min-w-0 touch-pan-x">
              {productTypes.map(type => <button type="button" key={type.id} aria-pressed={typeId === type.id} onClick={() => setTypeId(type.id)} className={`shrink-0 px-3 py-2 text-sm rounded-lg border whitespace-nowrap ${typeId === type.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-600'}`}>{categoryLabel(type)}</button>)}
            </div>
            <div className="grid sm:grid-cols-[1fr_150px] gap-3">
              <label className="block text-sm text-slate-600">商品名稱<input placeholder="輸入商品名稱" className={`${inputClass} mt-1`} value={productName} onChange={e => setProductName(e.target.value)} required /></label>
              <label className="block text-sm text-slate-600">原價（{currencyOf(activeBatch)}）<input type="number" min="0" step="any" placeholder="$" className={`${inputClass} mt-1`} value={price} onChange={e => setPrice(e.target.value)} required /></label>
            </div>
            <label className="block text-sm text-slate-600">商品備註（選填）<input placeholder="例：請指定容量、版本或保存期限" className={`${inputClass} mt-1`} value={note} onChange={e => setNote(e.target.value)} /></label>
            <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-500">台幣售價：{activeBatch && price !== '' ? `$${Math.ceil(Number(price) * activeBatch.exchangeRate).toLocaleString()}` : '—'}</p><button type="submit" className={primary}>新增</button></div>
          </fieldset>
        </form>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 flex flex-wrap justify-between gap-3 items-center border-b border-slate-200"><h2 className="text-lg font-bold">商品清單 <span className="text-sm font-normal text-slate-500">{shownProducts.length} 件</span></h2>
            <label className="text-sm text-slate-500 flex items-center gap-2"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />顯示已封存商品</label></div>
          <div className="md:hidden divide-y divide-slate-100">{shownProducts.map(p => <article key={p.id} className="p-4 space-y-3">
            <div><h3 className="font-medium break-words">{p.name}{p.archived ? '（已封存）' : ''}</h3><p className="text-xs text-slate-500 mt-1">{categoryLabel(productTypes.find(t => t.id === p.productType))}{p.note ? ` · ${p.note}` : ''}</p></div>
            <div className="flex flex-wrap justify-between gap-2 items-center"><div className="text-sm text-slate-500">{currencyOf(activeBatch)} {p.originalPrice.toLocaleString()}<strong className="block text-lg text-blue-600">{activeBatch?.missingMetadata ? '售價匯率待核對' : `TWD ${Math.ceil(p.originalPrice * (activeBatch?.exchangeRate || 1)).toLocaleString()}`}</strong></div>{productActions(p)}</div>
          </article>)}</div>
          <div className="hidden md:block overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-3">商品／備註</th><th className="px-4 py-3">分類</th><th className="px-4 py-3 text-right whitespace-nowrap">原價（{currencyOf(activeBatch)}）</th><th className="px-4 py-3 text-right whitespace-nowrap">售價（TWD）</th><th className="px-4 py-3 text-right">操作</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{shownProducts.map(p => <tr key={p.id}><td className="px-4 py-4"><span className="font-medium">{p.name}{p.archived ? '（已封存）' : ''}</span>{p.note && <p className="text-xs text-slate-500 mt-1">{p.note}</p>}</td><td className="px-4 py-4 whitespace-nowrap">{categoryLabel(productTypes.find(t => t.id === p.productType))}</td><td className="px-4 py-4 text-right">{p.originalPrice.toLocaleString()}</td><td className="px-4 py-4 text-right font-medium text-blue-600">{activeBatch?.missingMetadata ? '待核對' : Math.ceil(p.originalPrice * (activeBatch?.exchangeRate || 1)).toLocaleString()}</td><td className="px-4 py-4">{productActions(p)}</td></tr>)}</tbody>
          </table></div>
          {!shownProducts.length && <p className="p-8 text-center text-sm text-slate-500">此檔期尚無商品，請先新增商品。</p>}
        </div>
      </section>
    </div>}
    {editProduct && <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="edit-product-title" className="modal-panel space-y-4">
      <h2 id="edit-product-title" className="text-lg font-bold">編輯商品</h2><p className="text-sm text-slate-500">只更新商品資料，既有訂單的名稱、規格與成交價會保持原樣。</p>
      <label className="block text-sm">商品名稱<input aria-label="編輯商品名稱" className={`${inputClass} mt-1`} value={editProduct.name} onChange={e => setEditProduct({ ...editProduct, name: e.target.value })} /></label>
      <label className="block text-sm">原價（{currencyOf(activeBatch)}）<input aria-label="編輯商品原價" type="number" min="0" step="any" className={`${inputClass} mt-1`} value={Number.isNaN(editProduct.originalPrice) ? '' : editProduct.originalPrice} onChange={e => setEditProduct({ ...editProduct, originalPrice: e.target.value === '' ? NaN : Number(e.target.value) })} /></label>
      <label className="block text-sm">商品分類<select aria-label="編輯商品分類" className={`${inputClass} mt-1`} value={editProduct.productType} onChange={e => setEditProduct({ ...editProduct, productType: e.target.value })}>{!productTypes.some(t => t.id === editProduct.productType) && <option value={editProduct.productType}>其他商品（原分類已移除）</option>}{productTypes.map(t => <option key={t.id} value={t.id}>{categoryLabel(t)}</option>)}</select></label>
      <label className="block text-sm">備註<input aria-label="編輯商品備註" className={`${inputClass} mt-1`} value={editProduct.note || ''} onChange={e => setEditProduct({ ...editProduct, note: e.target.value })} /></label>
      <div className="flex justify-end gap-2"><button className={secondary} onClick={() => setEditProduct(null)}>取消</button><button className={primary} onClick={saveProduct}>儲存商品</button></div>
    </section></div>}
    {editBatch && <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="edit-batch-title" className="modal-panel space-y-4">
      <h2 id="edit-batch-title" className="text-lg font-bold">{editBatch.missingMetadata ? '修復歷史檔期' : '編輯檔期'}</h2><p className="text-sm text-slate-500">{editBatch.missingMetadata ? '請核對原始幣別與匯率。將以原檔期編號新增設定，所有既有訂單與商品保持原樣。修復後仍維持封存，可再手動恢復。' : '售價換算率只影響之後加入的商品，既有訂單成交價不變。有商品或訂單的檔期會保留原幣別。'}</p>
      <label className="block text-sm">檔期名稱<input aria-label="編輯檔期名稱" className={`${inputClass} mt-1`} value={editBatch.name} onChange={e => setEditBatch({ ...editBatch, name: e.target.value })} /></label>
      <label className="block text-sm">商品幣別<select aria-label="編輯檔期幣別" disabled={!!batchHasData && !editBatch.missingMetadata} className={`${inputClass} mt-1`} value={currencyOf(editBatch)} onChange={e => setEditBatch({ ...editBatch, currency: e.target.value })}>{CURRENCIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-3"><label className="text-sm">售價換算率<input aria-label="編輯售價換算率" type="number" min="0.000001" step="any" value={Number.isNaN(editBatch.exchangeRate) ? '' : editBatch.exchangeRate} className={`${inputClass} mt-1`} onChange={e => setEditBatch({ ...editBatch, exchangeRate: Number(e.target.value) })} /></label>
        <label className="text-sm">成本匯率<input aria-label="編輯成本匯率" type="number" min="0.000001" step="any" value={editBatch.costRate ?? legacyCostRate} className={`${inputClass} mt-1`} onChange={e => setEditBatch({ ...editBatch, costRate: Number(e.target.value) })} /></label></div>
      {!!memberGroups.length && <fieldset className="border-t pt-3"><legend className="text-sm">適用選項群組（未勾選表示全部）</legend><div className="flex flex-wrap gap-3 mt-2">{memberGroups.map(g => <label key={g.id} className="text-sm flex gap-2 items-center"><input type="checkbox" checked={editBatch.allowedGroupIds?.includes(g.id) || false} onChange={e => setEditBatch({ ...editBatch, allowedGroupIds: e.target.checked ? [...(editBatch.allowedGroupIds || []), g.id] : (editBatch.allowedGroupIds || []).filter(id => id !== g.id) })} />{g.name}</label>)}</div></fieldset>}
      <div className="flex justify-end gap-2"><button className={secondary} onClick={() => setEditBatch(null)}>取消</button><button className={primary} onClick={saveBatch}>儲存檔期</button></div>
    </section></div>}
    {transferSource && <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="transfer-title" className="modal-panel space-y-4">
      <h2 id="transfer-title" className="text-lg font-bold">移轉商品後刪除分類</h2><p className="text-sm text-slate-600">「{categoryLabel(productTypes.find(t => t.id === transferSource))}」有 {products.filter(p => p.productType === transferSource).length} 件商品。請選擇新分類，商品與歷史訂單都會保留。</p>
      <select aria-label="移轉至分類" className={inputClass} value={transferTarget} onChange={e => setTransferTarget(e.target.value)}><option value="">請選擇新分類</option>{productTypes.filter(t => t.id !== transferSource).map(t => <option key={t.id} value={t.id}>{categoryLabel(t)}</option>)}</select>
      <div className="flex justify-end gap-2"><button className={secondary} onClick={() => setTransferSource('')}>取消</button><button className={primary} disabled={!transferTarget} onClick={() => { onTransferCategory(transferSource, transferTarget); setTransferSource(''); }}>移轉並刪除分類</button></div>
    </section></div>}
  </div>;
};
export default ProductManager;

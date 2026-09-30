import React, { useState, useEffect } from 'react';
import { Product, Order, Batch, SHIPPING_METHODS, ShippingMethod, CartItem, SIZES, OrderStatus, MemberGroup, ProductTypeConfig } from '../types';
import { ShoppingCart, Trash2, Download, Package, User, AlertCircle, Calculator, Pencil, X, Plus, ArrowUpDown, Calendar, ChevronRight } from 'lucide-react';
import { exportOrdersToExcel } from '../services/excelService';
import { readDraft, blankDraft } from '../services/orderDraft';
import { categoryLabel, currencyOf } from '../services/catalog';
import { versionOf } from '../services/workspaceData';

interface OrderManagerProps {
  products: Product[];
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  activeBatch: Batch | undefined;
  memberGroups: MemberGroup[];
  productTypes: ProductTypeConfig[];
  draftStorageKey: string;
}

const STATUS_OPTIONS: { value: OrderStatus; label: string; color: string }[] = [
  { value: 'unpaid', label: '待付款', color: 'bg-red-100 text-red-700' },
  { value: 'paid', label: '已付款', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'shipping', label: '待出貨', color: 'bg-blue-100 text-blue-700' },
  { value: 'completed', label: '已完成', color: 'bg-green-100 text-green-700' },
  { value: 'cancelled', label: '已取消', color: 'bg-slate-100 text-slate-500' },
];

const STATUS_PRIORITY: Record<OrderStatus, number> = {
    'unpaid': 0,
    'paid': 1,
    'shipping': 2,
    'completed': 3,
    'cancelled': 4
};

const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

const OrderManager: React.FC<OrderManagerProps> = ({ products, orders, setOrders, activeBatch, memberGroups, productTypes, draftStorageKey }) => {
  // --- Create Order State ---
  const [initialDraft] = useState(() => { try { return { ...readDraft(localStorage, draftStorageKey), error: '' }; } catch { return { ...blankDraft(), error: '此檔期草稿無法讀取，原始內容已保留，請下載原始草稿備份。' }; } });
  const [customerName, setCustomerName] = useState(initialDraft.customerName);
  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>(initialDraft.shippingMethod);
  const [cart, setCart] = useState<CartItem[]>(initialDraft.cart);
  const [draftError, setDraftError] = useState(initialDraft.error);
  useEffect(() => {
    if (draftError || !activeBatch) return;
    try { localStorage.setItem(draftStorageKey, JSON.stringify({ customerName, shippingMethod, cart })); }
    catch { setDraftError('本機空間不足，草稿尚未備份。請先下載目前草稿。'); }
  }, [customerName, shippingMethod, cart, draftStorageKey, draftError, activeBatch?.id]);

  // --- View/Sort State ---
  const [sortType, setSortType] = useState<'date' | 'status'>('date');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  useEffect(() => { setSearchQuery(''); }, [activeBatch?.id]);

  // --- Item Selection State (Create Mode) ---
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [quantity, setQuantity] = useState('1');
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [selectedMember, setSelectedMember] = useState<string>('');
  const [isRandomNormal, setIsRandomNormal] = useState<boolean>(false);

  // --- Edit Modal State ---
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editShippingMethod, setEditShippingMethod] = useState<ShippingMethod>('賣貨便');
  const [editItems, setEditItems] = useState<CartItem[]>([]);

  // --- Item Selection State (Edit Mode) ---
  const [editSelectedProductId, setEditSelectedProductId] = useState<string>('');
  const [editQuantity, setEditQuantity] = useState('1');
  const [editSelectedSize, setEditSelectedSize] = useState<string>('');
  const [editSelectedColor, setEditSelectedColor] = useState<string>('');
  const [editSelectedMember, setEditSelectedMember] = useState<string>('');
  const [editIsRandomNormal, setEditIsRandomNormal] = useState<boolean>(false);

  // Filter products and orders by active batch
  const availableProducts = activeBatch
    ? products
        .filter(p => p.batchId === activeBatch.id && !p.archived)
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'))
    : [];

  const currentBatchOrders = activeBatch
    ? orders.filter(o => o.batchId === activeBatch.id)
    : [];

  // Filter groups allowed by active batch
  const allowedMemberGroups = activeBatch
    ? memberGroups.filter(g => !activeBatch.allowedGroupIds?.length || activeBatch.allowedGroupIds.includes(g.id))
    : [];

  // Apply Sort to Orders
  const searchTerms = searchQuery.normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const filteredOrders = currentBatchOrders.filter(order => {
    if (statusFilter && order.status !== statusFilter) return false;
    const text = [order.id, order.customerName, order.shippingMethod,
      STATUS_OPTIONS.find(status => status.value === order.status)?.label,
      ...order.items.flatMap(item => [item.productName, item.spec || ''])
    ].join(' ').normalize('NFKC').toLocaleLowerCase();
    return searchTerms.every(term => text.includes(term));
  });
  const sortedOrders = [...filteredOrders].sort((a, b) => {
      if (sortType === 'status') {
          const priorityA = STATUS_PRIORITY[a.status];
          const priorityB = STATUS_PRIORITY[b.status];
          if (priorityA !== priorityB) return priorityA - priorityB;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const selectedProduct = availableProducts.find(p => p.id === selectedProductId);
  const editSelectedProduct = availableProducts.find(p => p.id === editSelectedProductId);

  // --- Helper: Reset Selection ---
  const resetSelection = (mode: 'create' | 'edit') => {
    if (mode === 'create') {
      setSelectedProductId('');
      setQuantity('1');
      setSelectedSize('');
      setSelectedColor('');
      setSelectedMember('');
      setIsRandomNormal(false);
    } else {
      setEditSelectedProductId('');
      setEditQuantity('1');
      setEditSelectedSize('');
      setEditSelectedColor('');
      setEditSelectedMember('');
      setEditIsRandomNormal(false);
    }
  };

  // --- Helper: Add Item Logic ---
  const handleAddItem = (
    mode: 'create' | 'edit',
    prod: Product | undefined,
    qty: string,
    color: string,
    size: string,
    member: string,
    isRandom: boolean
  ) => {
    if (!prod || !activeBatch || prod.batchId !== activeBatch.id || (mode === 'create' && activeBatch.archived)) return;
    const numericQuantity = Number(qty);
    if (!/^\d+$/.test(qty) || !Number.isSafeInteger(numericQuantity) || numericQuantity < 1) {
      alert('請輸入大於 0 的整數數量');
      return;
    }

    // Find config for this product type
    const typeConfig = productTypes.find(t => t.id === prod.productType) || { requiresSpecs: false, requiresMember: false };

    // Validate Variants
    let specString = '';

    // Logic: If requires Specs (Size/Color)
    if (typeConfig.requiresSpecs || color.trim() || size.trim() || isRandom) {
       if (isRandom) {
           specString = '不指定款式';
       } else {
           if (!color.trim() && !size.trim()) {
               alert('請輸入規格（顏色、款式、尺寸或容量），或勾選不挑款');
               return;
           }
           specString = [color.trim(), size.trim()].filter(Boolean).join(' / ');
       }
    }

    // Logic: If requires Member
    if (typeConfig.requiresMember) {
        if (!member) {
            alert('請選擇選項或不挑款');
            return;
        }
        // If it also had specs, append member info
        specString = specString ? `${specString} (${member})` : member;
    }

    const twdPrice = Math.ceil(prod.originalPrice * activeBatch.exchangeRate);
    if (!Number.isFinite(twdPrice) || twdPrice < 0 || !Number.isFinite(twdPrice * numericQuantity)) { alert('商品價格或匯率有誤，請先修正商品設定。'); return; }

    const newItem: CartItem = {
      productId: prod.id,
      productName: prod.name,
      quantity: numericQuantity,
      unitPrice: twdPrice,
      originalUnitPrice: prod.originalPrice,
      totalPrice: twdPrice * numericQuantity,
      spec: specString
    };

    if (mode === 'create') {
      setCart(prev => [...prev, newItem]);
    } else {
      setEditItems(prev => [...prev, newItem]);
    }
    resetSelection(mode);
  };

  const removeFromCart = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  const calculateTotal = (items: CartItem[]) => {
    return items.reduce((sum, item) => sum + item.totalPrice, 0);
  };

  const calculateOriginalTotal = () => {
    return cart.reduce((sum, item) => sum + (item.originalUnitPrice * item.quantity), 0);
  };

  // --- Create Order ---
  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || cart.length === 0 || !activeBatch || activeBatch.archived || draftError) {
      alert('請確認資料完整');
      return;
    }
    if (cart.some(item => !products.some(p => p.id === item.productId && p.batchId === activeBatch.id && !p.archived))) {
      alert('草稿有已封存、刪除或不屬於此檔期的商品，請移除後再送出。原有草稿仍保留。'); return;
    }

    const newOrder: Order = {
      id: generateId(),
      batchId: activeBatch.id,
      customerName: customerName.trim(),
      items: [...cart],
      shippingMethod,
      totalAmount: calculateTotal(cart),
      status: 'unpaid',
      createdAt: new Date().toISOString()
    };

    setOrders(prev => [newOrder, ...prev]);

    setCustomerName('');
    setCart([]);
    setShippingMethod('賣貨便');
  };

  const handleDeleteOrder = (id: string) => {
    if(window.confirm('確定刪除此訂單？')) {
      setOrders(prev => prev.filter(o => o.id !== id));
    }
  };

  // --- Edit Order Logic ---
  const openEditModal = (order: Order) => {
    setEditingOrder(order);
    setEditCustomerName(order.customerName);
    setEditShippingMethod(order.shippingMethod);
    setEditItems([...order.items]); // Copy items
    resetSelection('edit');
  };

  const closeEditModal = () => {
    setEditingOrder(null);
    setEditItems([]);
  };

  const saveEditOrder = () => {
    if (!editingOrder) return;
    if (versionOf(orders.find(o => o.id === editingOrder.id)) !== versionOf(editingOrder)) {
      alert('此訂單已被另一個視窗或裝置修改，已停止覆蓋。您的編輯仍留在視窗中，請先下載編輯草稿，再關閉並重新開啟最新訂單。'); return;
    }
    if (!editCustomerName.trim() || editItems.length === 0) {
      alert('請確認資料完整（需有客戶名稱且至少一項商品）');
      return;
    }

    setOrders(prev => prev.map(o => {
      if (o.id === editingOrder.id) {
        return {
          ...o,
          customerName: editCustomerName.trim(),
          shippingMethod: editShippingMethod,
          items: editItems,
          totalAmount: calculateTotal(editItems) // Recalculate total
        };
      }
      return o;
    }));
    closeEditModal();
  };

  const removeEditItem = (index: number) => {
    setEditItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateStatus = (id: string, newStatus: OrderStatus) => {
    setOrders(prev => prev.map(o => {
      if (o.id === id) {
        return { ...o, status: newStatus };
      }
      return o;
    }));
  };

  if (!activeBatch) {
    return (
      <div className="flex flex-col items-center justify-center py-12 bg-white rounded-lg shadow-sm border border-slate-200">
        <AlertCircle className="w-10 h-10 text-slate-300 mb-3" />
        <p className="text-slate-500">請先在「商品與檔期設定」中選擇或建立一個檔期。</p>
      </div>
    );
  }

  // --- UI Component: Product Selector ---
  const renderProductInputs = (
    mode: 'create' | 'edit',
    selProdId: string,
    setSelProdId: (v: string) => void,
    prod: Product | undefined,
    color: string, setColor: (v: string) => void,
    size: string, setSize: (v: string) => void,
    member: string, setMember: (v: string) => void,
    qty: string, setQty: (v: string) => void,
    isRandom: boolean, setIsRandom: (v: boolean) => void
  ) => {
      const typeConfig = prod ? productTypes.find(t => t.id === prod.productType) : undefined;

      return (
        <div className={`p-4 rounded-xl border space-y-3 ${mode === 'create' ? 'bg-blue-50/50 border-blue-100' : 'bg-slate-50 border-slate-200'}`}>
        <h3 className={`text-xs font-bold uppercase tracking-wide ${mode === 'create' ? 'text-blue-600' : 'text-slate-600'}`}>
            {mode === 'create' ? '加入商品' : '新增商品到訂單'}
        </h3>

        <select
            value={selProdId}
            onChange={e => {
            setSelProdId(e.target.value);
            setColor(''); setMember(''); setSize(''); setIsRandom(false);
            }}
            className={`w-full px-3 py-2.5 md:py-2 border rounded-lg text-sm outline-none bg-white ${mode === 'create' ? 'border-blue-200 focus:border-blue-500' : 'border-slate-300 focus:border-slate-500'}`}
        >
            <option value="">-- 選擇商品 --</option>
            {productTypes.map(type => {
                const typeProducts = availableProducts.filter(p => p.productType === type.id);
                if (typeProducts.length === 0) return null;

                return (
                    <optgroup key={type.id} label={categoryLabel(type)}>
                         {typeProducts.map(p => {
                            const price = Math.ceil(p.originalPrice * activeBatch.exchangeRate);
                            return (
                                <option key={p.id} value={p.id}>
                                    {p.name} (${price})
                                </option>
                            );
                         })}
                    </optgroup>
                );
            })}
             {/* Fallback for products with invalid type */}
             {availableProducts.filter(p => !productTypes.find(t => t.id === p.productType)).length > 0 && (
                 <optgroup label="其他">
                     {availableProducts.filter(p => !productTypes.find(t => t.id === p.productType)).map(p => (
                         <option key={p.id} value={p.id}>{p.name} (${Math.ceil(p.originalPrice * activeBatch.exchangeRate)})</option>
                     ))}
                 </optgroup>
             )}
        </select>

        {/* Render Specs (Size/Color) Inputs if required */}
        {prod && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-2 pl-1">
                <input
                type="checkbox"
                id={`random-spec-${mode}`}
                checked={isRandom}
                onChange={(e) => setIsRandom(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor={`random-spec-${mode}`} className="text-sm text-slate-600 cursor-pointer select-none">
                不指定款式（不需填寫規格）
                </label>
            </div>

            {!isRandom && (
                <div className="grid grid-cols-2 gap-2">
                <div>
                    <input
                    type="text"
                    placeholder="顏色／款式（選填）"
                    value={color}
                    onChange={e => setColor(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none bg-white focus:border-blue-500"
                    />
                </div>
                <div>
                    <input
                    type="text"
                    aria-label="尺寸或容量"
                    placeholder="尺寸／容量（選填）"
                    list={`sizes-${mode}`}
                    value={size}
                    onChange={e => setSize(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none bg-white focus:border-blue-500"
                    />
                    <datalist id={`sizes-${mode}`}>
                      {SIZES.map(s => <option key={s} value={s} />)}
                    </datalist>
                </div>
                </div>
            )}
            </div>
        )}

        {/* Render Member Input if required */}
        {prod && typeConfig?.requiresMember && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
            <select
                value={member}
                onChange={e => setMember(e.target.value)}
                className="w-full px-3 py-2.5 md:py-2 border border-slate-300 rounded-lg text-sm outline-none bg-white focus:border-blue-500"
            >
                <option value="">-- 選擇款式／型號 --</option>
                <option value="不指定款式">不指定款式</option>
                {allowedMemberGroups.length > 0 ? (
                    allowedMemberGroups.map(group => (
                        group.subgroups.map(sub => (
                            <optgroup key={`${group.id}-${sub.name}`} label={`${group.name} - ${sub.name}`}>
                                {sub.members.map(m => (
                                    <option key={m} value={m}>{m}</option>
                                ))}
                            </optgroup>
                        ))
                    ))
                ) : (
                    // Fallback if no groups are selected for the batch but type requires members (show nothing or all)
                    // Currently showing empty to respect "only show selected" rule.
                    <optgroup label="無適用選項群組 (請檢查檔期設定)"></optgroup>
                )}
            </select>
            </div>
        )}

        <div className="flex gap-2">
            <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label={mode === 'create' ? '商品數量' : '新增商品數量'}
            value={qty}
            onFocus={e => e.currentTarget.select()}
            onChange={e => setQty(e.target.value)}
            className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-base outline-none text-center bg-white"
            placeholder="數量"
            />
            <button
            onClick={(e) => {
                e.preventDefault();
                handleAddItem(mode, prod, qty, color, size, member, isRandom);
            }}
            type="button"
            disabled={!selProdId}
            className={`flex-1 text-white text-sm font-medium rounded-lg transition-colors shadow-sm ${mode === 'create' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`}
            >
            {mode === 'create' ? '加入清單' : '加入訂單'}
            </button>
        </div>
        </div>
      );
    }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* Left Column: Create Order Form */}
        <div className="lg:col-span-4 min-w-0 space-y-6">
          <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="manager-title text-lg font-bold text-slate-800 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-blue-600" /> 建立訂單
              </h2>
              <span className="text-xs font-medium px-2 py-1 bg-blue-50 text-blue-700 rounded-full">
                {activeBatch.name}
              </span>
            </div>

            <p className="text-xs text-slate-500 mb-4">草稿依帳號與檔期保留，可切換頁面後繼續填寫。</p>
            {draftError && <div role="alert" className="text-sm text-red-700 mb-4">{draftError} <button className="underline" onClick={() => {
              const raw = initialDraft.error ? localStorage.getItem(draftStorageKey) || '' : JSON.stringify({ customerName, shippingMethod, cart });
              const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'order-draft-backup.json'; a.click(); URL.revokeObjectURL(url);
            }}>下載草稿備份</button></div>}
            <fieldset disabled={!!activeBatch.archived || !!draftError} className="space-y-4 min-w-0">
              {/* Customer Info Form - Stacked */}
              <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">客戶姓名</label>
                    <div className="relative">
                      <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        value={customerName}
                        onChange={e => setCustomerName(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="輸入姓名"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">出貨方式</label>
                    <select
                      value={shippingMethod}
                      onChange={e => setShippingMethod(e.target.value as ShippingMethod)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {SHIPPING_METHODS.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
              </div>

              <hr className="border-slate-100 my-4" />

              {/* Add Item Box */}
              {renderProductInputs(
                'create',
                selectedProductId, setSelectedProductId,
                selectedProduct,
                selectedColor, setSelectedColor,
                selectedSize, setSelectedSize,
                selectedMember, setSelectedMember,
                quantity, setQuantity,
                isRandomNormal, setIsRandomNormal
              )}

              {/* Cart Preview */}
              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase">訂單內容</h3>
                  {cart.length > 0 && <span className="text-xs text-slate-400">{cart.length} 樣商品</span>}
                </div>

                {cart.length === 0 ? (
                  <div className="text-sm text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-lg bg-slate-50">
                    清單是空的
                  </div>
                ) : (
                  <div className="space-y-2 pr-1">
                    {cart.map((item, idx) => (
                      <div key={idx} className="flex items-start justify-between p-3 bg-white rounded-lg border border-slate-200 shadow-sm gap-3 transition-colors hover:border-blue-300">
                        {/* Left: Info */}
                        <div className="flex-1 min-w-0 pt-0.5">
                          <div className="font-medium text-slate-800 leading-snug break-words">
                            {item.productName}
                          </div>
                          {item.spec && (
                             <div className="mt-2">
                                <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded text-[10px] md:text-xs font-medium border border-blue-100">
                                    {item.spec}
                                </span>
                             </div>
                          )}
                          <div className="text-xs text-slate-500 mt-2 flex flex-wrap gap-2 items-center">
                            <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-medium">x{item.quantity}</span>
                            <span>單價 ${item.unitPrice}</span>
                          </div>
                        </div>

                        {/* Right: Price & Delete */}
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="flex flex-col items-end">
                              <span className="font-bold text-slate-700 text-lg">${item.totalPrice}</span>
                          </div>
                          <button
                              onClick={(e) => { e.stopPropagation(); removeFromCart(idx); }}
                              type="button"
                              className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors border border-transparent hover:border-red-100"
                              title="移除"
                            >
                              <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Total Calculation Section */}
              <div className="pt-4 border-t border-slate-100 space-y-2">
                <div className="flex justify-between items-center text-slate-500 text-sm">
                   <span className="flex items-center gap-1">
                     <Calculator className="w-3 h-3" /> {currencyOf(activeBatch)} 商品總和:
                   </span>
                   <span className="font-medium">{calculateOriginalTotal()}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-600 font-bold">台幣總金額:</span>
                  <span className="text-2xl font-bold text-blue-600">${calculateTotal(cart)}</span>
                </div>

                <button
                  onClick={handleCreateOrder}
                  disabled={cart.length === 0 || !customerName.trim() || !!activeBatch.archived || !!draftError}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all mt-2"
                >
                  送出訂單
                </button>
              </div>
            </fieldset>
          </div>
        </div>

        {/* Right Column: Order List */}
        <div className="lg:col-span-8 min-w-0 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200 gap-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-600" />
              訂單紀錄
            </h2>
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              {/* Sort Toggle */}
              <div className="flex bg-slate-100 rounded-lg p-1">
                  <button
                     onClick={() => setSortType('date')}
                     className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${sortType === 'date' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                     日期
                  </button>
                  <button
                     onClick={() => setSortType('status')}
                     className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${sortType === 'status' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                     狀態
                  </button>
              </div>

              <button
                onClick={() => { void exportOrdersToExcel(sortedOrders, activeBatch.name).catch(() => alert('匯出失敗，請重試。')); }}
                disabled={sortedOrders.length === 0}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 border border-blue-200 text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Download className="w-4 h-4" /> {searchTerms.length ? '匯出搜尋結果' : '匯出'}
              </button>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
            <label htmlFor="order-search" className="block text-sm font-medium text-slate-700">搜尋訂單</label>
            <div className="flex gap-2">
              <input id="order-search" type="search" value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="客戶、商品、規格、訂單編號、配送或狀態"
                className="min-w-0 flex-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-base focus:ring-2 focus:ring-blue-500 outline-none" />
              {searchQuery && <button type="button" onClick={() => setSearchQuery('')} className="shrink-0 px-3 py-2 text-sm text-blue-600">清除</button>}
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">訂單狀態
              <select aria-label="篩選訂單狀態" value={statusFilter} onChange={e => setStatusFilter(e.target.value as OrderStatus | '')} className="border rounded-lg px-2 py-1 bg-white">
                <option value="">全部狀態</option>{STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            <p role="status" className="text-xs text-slate-500">顯示 {sortedOrders.length} / {currentBatchOrders.length} 筆訂單（目前檔期）</p>
          </div>

          <div className="space-y-4">
              {/* Mobile Card View (Hidden on MD+) */}
              <div className="md:hidden space-y-3">
                 {sortedOrders.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 bg-white rounded-xl border border-slate-200">
                        {searchTerms.length ? '找不到符合關鍵字的訂單，請調整搜尋或清除關鍵字。' : '目前沒有訂單'}
                    </div>
                 ) : (
                    sortedOrders.map((order) => (
                        <div key={order.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 relative">
                            {/* Header */}
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                                        <Calendar className="w-3 h-3" />
                                        {new Date(order.createdAt).toLocaleDateString('zh-TW')}
                                    </div>
                                    <h3 className="font-bold text-slate-800 text-lg">{order.customerName}</h3>
                                </div>
                                <select
                                    value={order.status}
                                    aria-label={`${order.customerName} 訂單狀態`}
                                    onChange={(e) => updateStatus(order.id, e.target.value as OrderStatus)}
                                    className={`px-2 py-1 rounded-full text-xs font-bold border cursor-pointer outline-none appearance-none text-center ${
                                        STATUS_OPTIONS.find(s => s.value === order.status)?.color || 'bg-slate-50'
                                    }`}
                                >
                                    {STATUS_OPTIONS.map(option => (
                                        <option key={option.value} value={option.value}>
                                        {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Items Summary */}
                            <div className="bg-slate-50 rounded-lg p-3 mb-3">
                                <ul className="space-y-2 text-sm">
                                    {order.items.slice(0, 3).map((item, i) => (
                                        <li key={i} className="flex justify-between text-slate-700">
                                            <span className="truncate pr-2">{item.productName}</span>
                                            <span className="flex-shrink-0 text-slate-500">x{item.quantity}</span>
                                        </li>
                                    ))}
                                    {order.items.length > 3 && (
                                        <li className="text-xs text-center text-slate-400 pt-1">
                                            還有 {order.items.length - 3} 樣商品...
                                        </li>
                                    )}
                                </ul>
                            </div>

                            {/* Footer */}
                            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                <div>
                                    <span className="text-xs text-slate-400 block">{order.shippingMethod}</span>
                                    <span className="font-bold text-blue-600 text-xl">${order.totalAmount}</span>
                                </div>
                                <div className="flex gap-2">
                                     <button
                                        onClick={() => openEditModal(order)}
                                        className="bg-blue-50 text-blue-600 px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1"
                                     >
                                        <Pencil className="w-4 h-4" /> 編輯
                                     </button>
                                     <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteOrder(order.id); }}
                                        className="bg-red-50 text-red-500 p-2 rounded-lg"
                                     >
                                        <Trash2 className="w-5 h-5" />
                                     </button>
                                </div>
                            </div>
                        </div>
                    ))
                 )}
              </div>

              {/* Desktop Table View (Hidden on Mobile) */}
              <div className="hidden md:block bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-slate-700 uppercase font-semibold">
                    <tr>
                        <th className="px-6 py-3 whitespace-nowrap">日期</th>
                        <th className="px-6 py-3 whitespace-nowrap">客戶</th>
                        <th className="px-6 py-3 min-w-[300px]">內容</th>
                        <th className="px-6 py-3 whitespace-nowrap">總額/方式</th>
                        <th className="px-6 py-3 whitespace-nowrap">
                            <button onClick={() => setSortType(sortType === 'status' ? 'date' : 'status')} className="flex items-center gap-1 hover:text-blue-600">
                                狀態 <ArrowUpDown className="w-3 h-3" />
                            </button>
                        </th>
                        <th className="px-6 py-3 text-right whitespace-nowrap">操作</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                    {sortedOrders.length === 0 ? (
                        <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                            {searchTerms.length ? '找不到符合關鍵字的訂單，請調整搜尋或清除關鍵字。' : '此檔期目前沒有訂單'}
                        </td>
                        </tr>
                    ) : (
                        sortedOrders.map((order) => (
                        <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-3 whitespace-nowrap">
                            {new Date(order.createdAt).toLocaleDateString('zh-TW')}
                            </td>
                            <td className="px-6 py-3 font-medium text-slate-900 whitespace-nowrap">{order.customerName}</td>
                            <td className="px-6 py-3">
                            <div className="text-xs text-slate-500">
                                {order.items.map((i, idx) => {
                                    const displaySpec = i.spec === '隨機' ? '隨機 / 不挑款' : i.spec;
                                    return (
                                    <span key={i.productId + i.spec + idx} className="block mb-1 last:mb-0 whitespace-normal">
                                        {i.productName} {displaySpec && <span className="text-slate-400">({displaySpec})</span>} x{i.quantity}
                                    </span>
                                    );
                                })}
                            </div>
                            </td>
                            <td className="px-6 py-3 whitespace-nowrap">
                            <div className="font-bold text-slate-700">${order.totalAmount}</div>
                            <div className="text-xs text-slate-400">{order.shippingMethod}</div>
                            </td>
                            <td className="px-6 py-3 whitespace-nowrap">
                            <select
                                value={order.status}
                                aria-label={`${order.customerName} 訂單狀態`}
                                onChange={(e) => updateStatus(order.id, e.target.value as OrderStatus)}
                                className={`px-2 py-1 rounded text-xs font-medium border cursor-pointer outline-none ${
                                STATUS_OPTIONS.find(s => s.value === order.status)?.color || 'bg-slate-50'
                                }`}
                            >
                                {STATUS_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                                ))}
                            </select>
                            </td>
                            <td className="px-6 py-3 text-right whitespace-nowrap">
                            <div className="flex justify-end gap-2">
                                <button
                                type="button"
                                onClick={() => openEditModal(order)}
                                className="text-slate-400 hover:text-blue-600 p-2 hover:bg-blue-50 rounded-full transition-colors"
                                title="編輯訂單"
                                >
                                <Pencil className="w-4 h-4 pointer-events-none" />
                                </button>
                                <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteOrder(order.id);
                                }}
                                className="text-slate-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-full transition-colors"
                                title="刪除訂單"
                                >
                                <Trash2 className="w-4 h-4 pointer-events-none" />
                                </button>
                            </div>
                            </td>
                        </tr>
                        ))
                    )}
                    </tbody>
                </table>
                </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Order Modal */}
      {editingOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-label="編輯訂單" className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-4 md:p-6 border-b border-slate-100">
              <h3 className="text-lg md:text-xl font-bold text-slate-800 flex items-center gap-2">
                <Pencil className="w-5 h-5 text-blue-600" /> 編輯訂單
              </h3>
              <button
                onClick={closeEditModal}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 md:p-6 overflow-y-auto flex-1 space-y-6">
              {/* Order Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">客戶姓名</label>
                  <input
                    type="text"
                    value={editCustomerName}
                    aria-label="編輯客戶姓名"
                    onChange={e => setEditCustomerName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">出貨方式</label>
                  <select
                    value={editShippingMethod}
                    onChange={e => setEditShippingMethod(e.target.value as ShippingMethod)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {SHIPPING_METHODS.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Items List */}
              <div>
                <h4 className="text-sm font-bold text-slate-700 mb-3 uppercase">訂單商品明細</h4>
                <div className="border rounded-lg overflow-hidden">
                   {/* Mobile List View for Items */}
                   <div className="md:hidden divide-y divide-slate-100">
                       {editItems.map((item, idx) => (
                           <div key={idx} className="p-3 bg-white flex justify-between items-center">
                               <div>
                                   <div className="font-medium text-slate-800">{item.productName}</div>
                                   <div className="text-xs text-slate-500 mt-1">{item.spec} x {item.quantity}</div>
                               </div>
                               <div className="flex items-center gap-3">
                                   <span className="font-bold text-slate-700">${item.totalPrice}</span>
                                   <button onClick={() => removeEditItem(idx)} className="text-red-400 p-1"><X className="w-5 h-5"/></button>
                               </div>
                           </div>
                       ))}
                       {editItems.length === 0 && <div className="p-4 text-center text-slate-400">無商品</div>}
                       <div className="p-3 bg-slate-50 flex justify-between font-bold">
                           <span>總金額</span>
                           <span className="text-blue-600">${calculateTotal(editItems)}</span>
                       </div>
                   </div>

                   {/* Desktop Table View */}
                   <table className="hidden md:table w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-600 font-medium">
                      <tr>
                        <th className="px-4 py-3">商品</th>
                        <th className="px-4 py-3">規格</th>
                        <th className="px-4 py-3">數量</th>
                        <th className="px-4 py-3">單價</th>
                        <th className="px-4 py-3">小計</th>
                        <th className="px-4 py-3 text-right">移除</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {editItems.length === 0 ? (
                        <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">無商品</td></tr>
                      ) : (
                        editItems.map((item, idx) => (
                          <tr key={idx}>
                            <td className="px-4 py-4">{item.productName}</td>
                            <td className="px-4 py-4 text-slate-500">{item.spec || '-'}</td>
                            <td className="px-4 py-4">{item.quantity}</td>
                            <td className="px-4 py-4">${item.unitPrice}</td>
                            <td className="px-4 py-4 font-bold text-slate-700">${item.totalPrice}</td>
                            <td className="px-4 py-4 text-right">
                              <button
                                onClick={() => removeEditItem(idx)}
                                className="text-red-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50"
                              >
                                <X className="w-5 h-5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold text-slate-800">
                      <tr>
                        <td colSpan={4} className="px-4 py-3 text-right">總金額:</td>
                        <td colSpan={2} className="px-4 py-3 text-blue-600">${calculateTotal(editItems)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Add Item Section inside Modal */}
              <div className="border-t pt-4">
                 {renderProductInputs(
                   'edit',
                   editSelectedProductId, setEditSelectedProductId,
                   editSelectedProduct,
                   editSelectedColor, setEditSelectedColor,
                   editSelectedSize, setEditSelectedSize,
                   editSelectedMember, setEditSelectedMember,
                   editQuantity, setEditQuantity,
                   editIsRandomNormal, setEditIsRandomNormal
                 )}
              </div>
            </div>

            <div className="p-4 md:p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-xl">
              <button className="px-3 py-2 text-sm text-blue-600" onClick={() => {
                const url = URL.createObjectURL(new Blob([JSON.stringify({ ...editingOrder, customerName: editCustomerName, shippingMethod: editShippingMethod, items: editItems, totalAmount: calculateTotal(editItems) }, null, 2)], { type: 'application/json' }));
                const a = document.createElement('a'); a.href = url; a.download = 'order-edit-draft.json'; a.click(); URL.revokeObjectURL(url);
              }}>下載編輯草稿</button>
              <button
                onClick={closeEditModal}
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={saveEditOrder}
                className="px-6 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
              >
                儲存變更
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default OrderManager;

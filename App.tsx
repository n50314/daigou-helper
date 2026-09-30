import React, { useState, useEffect, useRef } from 'react';
import { Product, Order, Batch, UserProfile, MemberGroup, ProductTypeConfig } from './types';
import ProductManager from './components/ProductManager';
import OrderManager from './components/OrderManager';
import SummaryManager from './components/SummaryManager';
import CloudSettings from './components/CloudSettings';
import { LayoutDashboard, ShoppingBag, Settings, ClipboardList, RefreshCw, UserCircle, LogOut, Upload, Download, ChevronDown, Cloud, Shield, AlertCircle, Menu, MessageSquarePlus } from 'lucide-react';
import { initializeCloud, subscribeToAuthChanges, logoutFirebase } from './services/cloudService';
import { useAccountWorkspace } from './services/useAccountWorkspace';
import { legacyBackup, normalizeWorkspace, workspaceKey } from './services/workspaceData';
import { validateWorkspaceImport, currencyOf, costRateOf } from './services/catalog';
import { accessibleBatches, removeOrArchiveBatch, transferCategory } from './services/business';
import { demoWorkspace } from './services/demo';
import { draftKey } from './services/orderDraft';
import { FeedbackProvider, useFeedback } from './components/Feedback';
import { WorkspaceTabs, type WorkspaceTab } from './components/WorkspaceTabs';
import { AnimatedNumber, MotionPresence } from './components/Motion';

const CONTACT_FORM_URL = "https://forms.gle/5ygYpvGrJLR4cKDd7";

// --- 廣告設定 ---
// 如果要顯示兩側廣告欄位，請將 false 改為 true
const SHOW_ADS = false;

function App() {
  const [user, setUser] = useState<UserProfile | null | undefined>(undefined);
  useEffect(() => {
    initializeCloud();
    return subscribeToAuthChanges(setUser);
  }, []);
  if (user === undefined) return <div className="p-8 text-center text-slate-500">正在確認登入帳號…</div>;
  return <FeedbackProvider key={user?.uid || 'guest'}><AccountWorkspace user={user} /></FeedbackProvider>;
}

function AccountWorkspace({ user }: { user: UserProfile | null }) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('orders');
  const notify = useFeedback();
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
  const [detachedBatchId, setDetachedBatchId] = useState('');

  const workspace = useAccountWorkspace(user?.uid || null);
  const { data, status: saveStatus, editable, message } = workspace;
  const previousSave = useRef(saveStatus);
  useEffect(() => {
    if (user && saveStatus === 'saved' && ['saving', 'pending'].includes(previousSave.current)) notify('雲端同步完成', '目前帳號的修改已儲存');
    previousSave.current = saveStatus;
  }, [saveStatus, notify, user?.uid]);
  const { batches, products, orders, activeBatchId, memberGroups, productTypes, costRate, purchaseChecks } = data;
  const setBatches = workspace.setField('batches');
  const setProducts = workspace.setField('products');
  const setOrders = workspace.setField('orders');
  const setActiveBatchId = workspace.setField('activeBatchId');
  const setMemberGroups = workspace.setField('memberGroups');
  const setProductTypes = workspace.setField('productTypes');
  const setPurchaseChecks = workspace.setField('purchaseChecks');

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  // --- Click Outside to Close Menu ---
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayBatches = accessibleBatches(data);
  const selectedBatchId = detachedBatchId || activeBatchId;
  const activeBatch = displayBatches.find(b => b.id === selectedBatchId);
  const selectBatch = (id: string) => { if (batches.some(b => b.id === id)) { setDetachedBatchId(''); setActiveBatchId(id); } else setDetachedBatchId(id); };
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Data Import/Export Logic ---
  const handleExportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `daigou_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setIsUserMenuOpen(false);
    notify('備份已下載', '請將 JSON 檔案保存在安全的位置');
  };

  const handleRawBackup = () => {
    const prefix = workspaceKey(user?.uid || null);
    const entries = Object.fromEntries(Object.keys(localStorage).filter(key => key === prefix || key.startsWith(`${prefix}:backup:`)).map(key => [key, localStorage.getItem(key)]));
    const url = URL.createObjectURL(new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'daigou_raw_cache_backup.json'; link.click(); URL.revokeObjectURL(url);
  };

  const handleLegacyExport = () => {
    const backup = legacyBackup(localStorage);
    if (!backup) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'daigou_legacy_unassigned_backup.json'; link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
    setIsUserMenuOpen(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const json = JSON.parse(event.target?.result as string);

            if (!editable) { alert('請等待帳號資料讀取完成，或先處理同步錯誤。'); return; }
            const imported = normalizeWorkspace(json);
            validateWorkspaceImport(imported);
            if(window.confirm(`匯入對象：${user ? user.email : '本機訪客'}\n檔期 ${imported.batches.length} 個、商品 ${imported.products.length} 件、訂單 ${imported.orders.length} 筆。\n目前有 ${orders.length} 筆訂單。這會取代目前資料，取代前會保留本機備份。確定匯入？`)) {
                if (workspace.replaceData(imported)) notify('資料已匯入', '請依畫面的同步狀態確認雲端儲存');
            }
        } catch (err) {
            alert(err instanceof Error ? err.message : '無法讀取檔案，目前資料未更動。');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleLogout = async () => {
    if(window.confirm('確定要登出嗎？')) {
        await logoutFirebase();
        setIsUserMenuOpen(false);
    }
  };

  // --- 廣告區塊元件 ---
  // 未來若要加入廣告，請將 SHOW_ADS 改為 true，並修改下方的內容
  const AdSpace = ({ position }: { position: 'left' | 'right' }) => (
    <aside className="hidden 2xl:flex flex-col w-[180px] flex-shrink-0 p-4 gap-4 transition-all">
      {/*
          在此處貼上廣告程式碼 (例如 Google AdSense 的 <script> 與 <ins> 標籤)
          目前為預覽佔位符
      */}
      <div className="w-full h-[600px] bg-white rounded-lg border border-slate-200 shadow-sm flex flex-col items-center justify-center text-slate-400 gap-2 relative overflow-hidden">
         <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
             <div className="text-center">
                 <p className="text-xs font-bold text-slate-300">Google Ads</p>
                 <p className="text-[10px] text-slate-300">160x600</p>
             </div>
         </div>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-[#F7F7F8] text-slate-800 font-sans flex flex-col">
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />

      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 flex-shrink-0 shadow-sm md:shadow-none">
        <div className="w-full px-4 md:px-6">
          <div className="flex flex-col md:flex-row justify-between h-auto md:h-16 py-2 md:py-0 gap-2 md:gap-0">
            <div className="flex items-center justify-between md:justify-start gap-3">
              <div className="flex items-center gap-3">
                  <div className="bg-blue-600 text-white p-2 rounded-lg shadow-sm">
                    <ShoppingBag className="w-5 h-5 md:w-6 md:h-6" />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 md:gap-3">
                        <h1 className="text-lg md:text-xl font-bold text-slate-800 tracking-tight">代購小幫手</h1>
                        <div className="flex items-center text-[10px] md:text-xs font-medium transition-all duration-300">
                            {!user ? (
                                <span className="text-slate-400 flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-full"><Shield className="w-3 h-3" /> <span className="hidden xs:inline">本機</span></span>
                            ) : (
                                <>
                                    {saveStatus === 'saving' || saveStatus === 'pending' || saveStatus === 'loading' ? (
                                        <span className="text-slate-500 flex items-center gap-1.5">
                                            <RefreshCw className="w-3 h-3 animate-spin" />
                                            <span className="hidden sm:inline">同步中...</span>
                                        </span>
                                    ) : saveStatus === 'saved' ? (
                                        <span className="text-green-600 flex items-center gap-1.5">
                                            <Cloud className="w-3 h-3" />
                                            <span className="hidden sm:inline">已同步</span>
                                        </span>
                                    ) : saveStatus === 'error' || saveStatus === 'conflict' ? (
                                        <span className="text-red-500 flex items-center gap-1.5">
                                            <AlertCircle className="w-3 h-3" />
                                            <span className="hidden sm:inline">同步失敗</span>
                                        </span>
                                    ) : (
                                        <span className="text-slate-400 flex items-center gap-1.5">
                                            <Cloud className="w-3 h-3" />
                                        </span>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                  </div>
              </div>

              <div className="flex items-center gap-3">
                  {/* User Menu */}
                   <div className="relative" ref={userMenuRef}>
                        <button
                            aria-label="帳號選單"
                            aria-expanded={isUserMenuOpen}
                            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                            className="flex items-center gap-2 hover:bg-slate-50 rounded-full p-1 pr-3 border border-transparent hover:border-slate-200 transition-all"
                        >
                            {user?.photoURL ? (
                                <img src={user.photoURL} alt="User" className="w-8 h-8 rounded-full" />
                            ) : (
                                <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-slate-500">
                                    <UserCircle className="w-5 h-5" />
                                </div>
                            )}
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                        </button>

                        <MotionPresence show={isUserMenuOpen} onDismiss={() => setIsUserMenuOpen(false)}>
                            <div className="account-popover absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-100 py-2 z-50">
                                {user ? (
                                    <div className="px-4 py-3 border-b border-slate-100 mb-2">
                                        <p className="text-sm font-bold text-slate-800 truncate">{user.displayName}</p>
                                        <p className="text-xs text-slate-500 truncate">{user.email}</p>
                                    </div>
                                ) : (
                                    <div className="px-2 pb-2 border-b border-slate-100 mb-2">
                                        <button
                                            onClick={() => { setIsCloudModalOpen(true); setIsUserMenuOpen(false); }}
                                            className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg flex items-center gap-2 font-medium"
                                        >
                                            <Cloud className="w-4 h-4" /> 登入 / 雲端同步
                                        </button>
                                    </div>
                                )}

                                <button
                                    onClick={handleExportData}
                                    className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                                >
                                    <Download className="w-4 h-4" /> 備份資料 (JSON)
                                </button>
                                {localStorage.getItem('dg_legacy_backup_v2') && (
                                  <button onClick={handleLegacyExport} className="w-full text-left px-4 py-2 text-sm text-amber-700 hover:bg-amber-50">下載舊版本機備份</button>
                                )}
                                <button disabled={!editable}
                                    onClick={handleImportClick}
                                    className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                                >
                                    <Upload className="w-4 h-4" /> 匯入資料
                                </button>
                                <button onClick={handleRawBackup} className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">下載原始快取與恢復備份</button>

                                <a
                                    href={CONTACT_FORM_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full text-left px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                                    onClick={() => setIsUserMenuOpen(false)}
                                >
                                    <MessageSquarePlus className="w-4 h-4" /> 意見回饋 / 回報問題
                                </a>

                                {user && (
                                    <>
                                        <div className="border-t border-slate-100 my-2"></div>
                                        <button
                                            onClick={handleLogout}
                                            className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2"
                                        >
                                            <LogOut className="w-4 h-4" /> 登出
                                        </button>
                                    </>
                                )}
                            </div>
                        </MotionPresence>
                   </div>
              </div>
            </div>

            <WorkspaceTabs compact active={activeTab} onChange={setActiveTab} />
          </div>
        </div>
      </nav>

      <div className="app-layout flex-1 flex w-full p-4 md:p-6 gap-6 items-start">
         {SHOW_ADS && <AdSpace position="left" />}

         <main className="flex-1 min-w-0 w-full">
            <div className="manager-context flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-slate-500 mb-1">{user ? '帳號工作區' : '本機工作區'}</p>
                <p className="text-sm font-medium break-all">{user ? `目前帳號：${user.email}` : '本機訪客資料（登入後會切換為該帳號的雲端資料）'}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <label htmlFor="workspace-batch" className="text-sm text-slate-500">目前檔期</label>
                <select id="workspace-batch" value={selectedBatchId} disabled={!editable} onChange={e => selectBatch(e.target.value)} className="min-w-0 max-w-full border border-slate-300 rounded-lg px-3 py-2 bg-white text-sm">
                  {!batches.length && <option value="">尚無檔期</option>}
                  {displayBatches.map(batch => <option key={batch.id} value={batch.id}>{batch.name}{batch.archived && !batch.missingMetadata ? '（已封存）' : ''} · {currencyOf(batch)}</option>)}
                </select>
                {!user && <button disabled={!editable} className="text-sm px-3 py-2 text-blue-600 border border-blue-200 rounded-lg" onClick={() => { if (confirm('載入一般代購示範資料？會先備份並取代本機訪客資料，不會更動已綁定帳號。')) { workspace.replaceData(demoWorkspace()); notify('示範資料已載入', '僅使用本機訪客工作區'); } }}>載入示範資料</button>}
              </div>
            </div>
            {displayBatches.some(b => b.missingMetadata) && !activeBatch?.missingMetadata && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 p-3 rounded-lg mb-4">有歷史資料缺少檔期設定，內容仍保留。可在「目前檔期」選擇未歸檔歷史資料查詢。</p>}
            {activeBatch?.archived && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 p-3 rounded-lg mb-4">{activeBatch.missingMetadata ? '原檔期設定已不存在，歷史資料仍可查詢、編輯及匯出。請至商品設定核對幣別與匯率後修復檔期；成本估算暫沿用舊全域匯率。' : '此檔期已封存。既有訂單仍可查詢、編輯、更新狀態及匯出；請至商品設定恢復檔期後再建立新訂單。'}</p>}
            {localStorage.getItem('dg_legacy_backup_v2') && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 p-3 rounded-lg mb-3">舊版本機資料已保留備份，尚未指定所屬帳號。可從帳號選單下載，核對後再匯入。</p>
            )}
            {(saveStatus === 'loading' || message) && (
              <div role="alert" className="p-4 mb-4 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-900">
                {saveStatus === 'loading' ? '正在讀取此帳號的雲端資料，完成前暫停編輯。' : message}
                {saveStatus === 'error' && <button onClick={workspace.retry} className="ml-3 underline">重試同步</button>}
                {saveStatus === 'conflict' && <button onClick={() => { if (window.confirm('本機修改會保留備份，並載入雲端版本。確定嗎？')) workspace.loadCloud(); }} className="ml-3 underline">載入雲端版本</button>}
                {saveStatus !== 'loading' && <button onClick={handleExportData} className="ml-3 underline">下載目前資料備份</button>}
                {saveStatus !== 'loading' && <button onClick={handleRawBackup} className="ml-3 underline">下載原始快取</button>}
              </div>
            )}
            <WorkspaceTabs active={activeTab} onChange={setActiveTab} />
            <div className="page-intro">
              <div><h2>{activeTab === 'orders' ? '訂單管理' : activeTab === 'products' ? '商品與檔期' : '採購彙整'}</h2>
                <p>{activeTab === 'orders' ? '建立訂單、追蹤付款與出貨，草稿可隨時續填。' : activeTab === 'products' ? '設定商品、分類與匯率，保留每筆歷史成交資料。' : '依商品與規格整理採購數量，掌握進度與商品毛利。'}</p>
              </div>
              <div className="workspace-counts" aria-label="目前檔期資料數量">
                <div><strong><AnimatedNumber value={orders.filter(o => o.batchId === selectedBatchId).length} /></strong><span>筆訂單</span></div>
                <div><strong><AnimatedNumber value={products.filter(p => p.batchId === selectedBatchId && !p.archived).length} /></strong><span>件商品</span></div>
              </div>
            </div>
            <fieldset id="workspace-panel" key={activeTab} disabled={!editable} className={`page-panel min-w-0 ${!editable ? 'pointer-events-none opacity-60' : ''}`}>
                {activeTab === 'orders' && (
                    <OrderManager
                        key={selectedBatchId || 'no-batch'}
                        draftStorageKey={draftKey(user?.uid || null, selectedBatchId)}
                        products={products}
                        orders={orders}
                        setOrders={setOrders}
                        activeBatch={activeBatch}
                        memberGroups={memberGroups}
                        productTypes={productTypes}
                    />
                )}

                {activeTab === 'products' && (
                    <ProductManager
                        orders={orders}
                        legacyCostRate={costRate}
                        onRemoveBatch={id => { workspace.updateData(data => removeOrArchiveBatch(data, id)); notify('檔期管理已更新', '既有商品與訂單仍保留'); }}
                        onTransferCategory={(source, target) => { try { workspace.updateData(data => transferCategory(data, source, target)); notify('分類已移轉', '商品與歷史訂單已保留'); } catch { alert('分類已更新，請重新選擇移轉目標。目前資料未更動。'); } }}
                        products={products}
                        setProducts={setProducts}
                        batches={displayBatches}
                        setBatches={setBatches}
                        activeBatchId={selectedBatchId}
                        setActiveBatchId={selectBatch}
                        memberGroups={memberGroups}
                        setMemberGroups={setMemberGroups}
                        productTypes={productTypes}
                        setProductTypes={setProductTypes}
                    />
                )}

                {activeTab === 'summary' && (
                    <SummaryManager
                        key={activeBatch?.id || 'no-batch'}
                        checkedKeys={purchaseChecks[activeBatch?.id || ''] || []}
                        onCheckedKeysChange={keys => { if (activeBatch) setPurchaseChecks(prev => ({ ...prev, [activeBatch.id]: keys })); }}
                        costRate={costRateOf(activeBatch, costRate)}
                        canUpdateRate={!activeBatch?.missingMetadata}
                        setCostRate={rate => { if (activeBatch) setBatches(prev => prev.map(b => b.id === activeBatch.id ? { ...b, costRate: rate } : b)); }}
                        orders={orders}
                        activeBatch={activeBatch}
                    />
                )}
            </fieldset>
         </main>

         {SHOW_ADS && <AdSpace position="right" />}
      </div>

      <footer className="bg-white border-t border-slate-200 py-4 mt-auto">
        <div className="text-center">
             <p className="text-xs text-slate-400">
                &copy; {new Date().getFullYear()} 代購小幫手 Manager. All rights reserved.
            </p>
            <a
                href={CONTACT_FORM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 mt-1 transition-colors"
            >
                <MessageSquarePlus className="w-3 h-3" /> 意見回饋與問題回報
            </a>
        </div>
      </footer>

      <CloudSettings
         isOpen={isCloudModalOpen}
         onClose={() => setIsCloudModalOpen(false)}
         user={user}
         syncStatus={saveStatus}
      />

    </div>
  );
}

export default App;

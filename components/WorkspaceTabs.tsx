import React, { useLayoutEffect, useRef, useState } from 'react';
import { ShoppingBag, LayoutDashboard, ClipboardList } from 'lucide-react';

export type WorkspaceTab = 'orders' | 'products' | 'summary';
export function WorkspaceTabs({ active, onChange, compact = false }: { active: WorkspaceTab; onChange: (tab: WorkspaceTab) => void; compact?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const [position, setPosition] = useState({ left: 0, width: 0 });
  const items = [
    { id: 'orders' as const, label: '訂單管理', icon: ShoppingBag },
    { id: 'products' as const, label: compact ? '商品設定' : '商品與檔期設定', icon: LayoutDashboard },
    { id: 'summary' as const, label: compact ? '採購清單' : '採購彙整表', icon: ClipboardList }
  ];
  useLayoutEffect(() => {
    const measure = () => {
      const button = buttons.current[['orders', 'products', 'summary'].indexOf(active)];
      if (!button) return;
      const next = { left: button.offsetLeft, width: button.offsetWidth };
      setPosition(prev => prev.left === next.left && prev.width === next.width ? prev : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, [active]);
  return <div ref={root} role="group" aria-label="主要功能" className={`workspace-tabs ${compact ? 'mobile-tabs md:hidden' : 'desktop-tabs hidden md:flex'}`}>
    <span aria-hidden="true" className="tab-indicator" style={{ width: position.width, transform: `translateX(${position.left}px)`, opacity: position.width ? 1 : 0 }} />
    {items.map((item, index) => <button key={item.id} ref={node => buttons.current[index] = node} type="button" aria-pressed={active === item.id} aria-controls="workspace-panel" className="workspace-tab" onClick={() => onChange(item.id)} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault(); const next = (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
      onChange(items[next].id); buttons.current[next]?.focus();
    }}><item.icon size={16} />{item.label}</button>)}
  </div>;
}

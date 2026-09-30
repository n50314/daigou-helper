import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Check, Info, X } from 'lucide-react';
import { MotionPresence } from './Motion';

type Notice = { id: number; title: string; detail?: string; tone: 'success' | 'info' };
const FeedbackContext = createContext<(title: string, detail?: string, tone?: Notice['tone']) => void>(() => {});
export const useFeedback = () => useContext(FeedbackContext);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [closing, setClosing] = useState<number[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const nextId = useRef(0);
  const schedule = useCallback((action: () => void, delay: number) => {
    const timer = setTimeout(() => { timers.current.delete(timer); action(); }, delay);
    timers.current.add(timer);
  }, []);
  const dismiss = useCallback((id: number) => {
    setClosing(ids => ids.includes(id) ? ids : [...ids, id]);
    schedule(() => { setNotices(items => items.filter(item => item.id !== id)); setClosing(ids => ids.filter(value => value !== id)); }, 180);
  }, [schedule]);
  const notify = useCallback((title: string, detail?: string, tone: Notice['tone'] = 'success') => {
    const id = ++nextId.current;
    setNotices(items => [...items.slice(-2), { id, title, detail, tone }]);
    schedule(() => dismiss(id), 3800);
  }, [dismiss, schedule]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return <FeedbackContext.Provider value={notify}>
    {children}
    <div className="toast-stack" aria-live="polite" aria-atomic="false" aria-relevant="additions" data-testid="feedback-notices">
      {notices.map(notice => <MotionPresence key={notice.id} show={!closing.includes(notice.id)}>
        <div className="feedback-toast">
          <span className="feedback-icon">{notice.tone === 'success' ? <Check size={18} /> : <Info size={18} />}</span>
          <div className="min-w-0 flex-1"><p className="font-semibold text-sm">{notice.title}</p>{notice.detail && <p className="text-xs text-slate-500 mt-1">{notice.detail}</p>}</div>
          <button aria-label="關閉通知" onClick={() => dismiss(notice.id)} className="toast-dismiss"><X size={16} /></button>
        </div>
      </MotionPresence>)}
    </div>
  </FeedbackContext.Provider>;
}

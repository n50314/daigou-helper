import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return reduced;
}

// Retains the last visible frame for the exit only; unmounting the account clears it.
export function MotionPresence({ show, children, onDismiss }: { show: boolean; children: React.ReactNode; onDismiss?: () => void }) {
  const last = useRef<React.ReactNode>(null);
  const root = useRef<HTMLDivElement>(null);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const [leaving, setLeaving] = useState(false);
  const reduced = useReducedMotion();
  if (show) last.current = children;
  useLayoutEffect(() => {
    if (root.current) root.current.inert = !show;
    if (show) { setLeaving(false); return; }
    if (!last.current || reduced) { last.current = null; setLeaving(false); return; }
    setLeaving(true);
    const timeout = setTimeout(() => { last.current = null; setLeaving(false); }, 170);
    return () => clearTimeout(timeout);
  }, [show, reduced]);
  useEffect(() => {
    if (!show || !onDismiss) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = root.current?.querySelector<HTMLElement>('[role="dialog"]');
    const controls = () => dialog ? [...dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex="0"]')].filter(node => !node.matches(':disabled') && node.getClientRects().length) : [];
    const frame = requestAnimationFrame(() => controls()[0]?.focus());
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); dismiss.current?.(); }
      if (event.key !== 'Tab' || !dialog) return;
      const nodes = controls(); if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', keyboard); if (dialog && previous?.isConnected) previous.focus(); };
  }, [show, !!onDismiss]);
  if (!show && !leaving) return null;
  return <div ref={node => { root.current = node; if (node) node.inert = !show; }} className="motion-presence" data-state={show ? 'enter' : 'exit'} aria-hidden={!show || undefined}>{show ? children : last.current}</div>;
}

export function AnimatedNumber({ value, format = number => Math.round(number).toLocaleString('zh-TW') }: { value: number; format?: (number: number) => string }) {
  const reduced = useReducedMotion();
  const [displayed, setDisplayed] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    if (reduced) { current.current = value; setDisplayed(value); return; }
    const from = current.current;
    if (from === value) return;
    let frame: number;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / 360, 1);
      const next = from + (value - from) * (1 - Math.pow(1 - progress, 3));
      current.current = next; setDisplayed(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);
  return <span aria-label={format(value)} className="animated-number">{format(reduced ? value : displayed)}</span>;
}

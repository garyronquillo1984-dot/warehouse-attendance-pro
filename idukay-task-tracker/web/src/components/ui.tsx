import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '../lib/i18n';

// ---------- toasts ----------
type Toast = { id: number; text: string; kind: 'ok' | 'error' };
const ToastCtx = createContext<(text: string, kind?: 'ok' | 'error') => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts(ts => [...ts.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), kind === 'error' ? 5000 : 2600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap" aria-live="polite">
        {toasts.map(t => <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`} role={t.kind === 'error' ? 'alert' : 'status'}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------- bottom sheet / dialog ----------
// Locks background scrolling WITHOUT changing the scroll position (overflow on <html> only),
// so closing a sheet returns the parent exactly where they were.
export function Sheet({ open, onClose, title, children, labelledBy }: {
  open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; labelledBy?: string;
}) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });
    return () => {
      document.documentElement.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
      opener?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} ref={ref}>
        <div className="grabber" />
        {title !== undefined && (
          <div className="sheet-head">
            <div className="grow">{title}</div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label={t.common.close}>✕</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export const Spinner = () => <div className="spinner" role="status" aria-label="…" />;

export function Empty({ icon = '📭', children, action }: { icon?: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty"><div className="big" aria-hidden>{icon}</div><div>{children}</div>{action && <div style={{ marginTop: 14 }}>{action}</div>}</div>;
}

export function Field({ label, optional, children }: { label: string; optional?: boolean; children: ReactNode }) {
  const { t } = useT();
  return <label className="field"><span>{label}{optional && <em> ({t.common.optional})</em>}</span>{children}</label>;
}

// Remembers which rows a filtered list has shown since the page opened, so a row that stops
// matching (e.g. a pending task just ticked as done) stays in place instead of vanishing and
// shifting everything below it.
export function useSticky<T extends { id: string }>(items: T[], matches: (x: T) => boolean, resetKey: unknown = null): T[] {
  const seen = useRef<Set<string>>(new Set());
  const key = useRef<unknown>(resetKey);
  if (key.current !== resetKey) { seen.current = new Set(); key.current = resetKey; }
  const out: T[] = [];
  for (const x of items) {
    if (matches(x)) { seen.current.add(x.id); out.push(x); }
    else if (seen.current.has(x.id)) out.push(x);
  }
  return out;
}

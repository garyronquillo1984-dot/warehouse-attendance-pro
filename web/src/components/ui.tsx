import type { ReactNode, InputHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';

export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="6" fill="#1C2321" />
      <rect x="6" y="22" width="20" height="4" fill="#F2C230" />
      <path d="M9 8l3.5 11L16 10l3.5 9L23 8" fill="none" stroke="#EEF0EC" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="wordmark" aria-label="Warehouse Attendance Pro home">
      <Mark /> <span>Warehouse Attendance Pro</span>
    </Link>
  );
}

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth">
      <div className="auth-panel">
        <Wordmark to="/login" />
        {children}
      </div>
    </main>
  );
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}
export function Field({ label, hint, error, id, ...rest }: FieldProps) {
  const fid = id ?? rest.name ?? label.toLowerCase().replace(/\W+/g, '-');
  const hintId = hint ? `${fid}-hint` : undefined;
  const errId = error ? `${fid}-error` : undefined;
  return (
    <div className="field">
      <label htmlFor={fid}>{label}</label>
      <input id={fid} aria-invalid={error ? true : undefined}
             aria-describedby={[hintId, errId].filter(Boolean).join(' ') || undefined} {...rest} />
      {hint && <span className="hint" id={hintId}>{hint}</span>}
      {error && <span className="error" id={errId}>{error}</span>}
    </div>
  );
}

export function Notice({ kind, children }: { kind: 'error' | 'ok' | 'info'; children: ReactNode }) {
  return <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="spinner" role="status">{label}</div>;
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="stepper" style={{ ['--steps' as string]: steps.length }} aria-label="Setup progress">
      {steps.map((s, i) => (
        <li key={s} data-state={i < current ? 'done' : i === current ? 'current' : 'todo'}
            aria-current={i === current ? 'step' : undefined}>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

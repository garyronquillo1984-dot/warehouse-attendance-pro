import { memo } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../lib/i18n';
import { addDays, fmtDate } from '../lib/dates';
import { STALE_AFTER_HOURS } from '../lib/config';
import type { Homework, Lang, ParentStatus } from '../lib/types';
import { IconCheck } from './Icons';

export function LanguageBadge({ lang }: { lang: Lang }) {
  const { t } = useT();
  return <span className={`pill lang-${lang}`} data-testid="lang-badge">{t.langNames[lang]}</span>;
}

export function StatusChip({ status }: { status: ParentStatus }) {
  const { t } = useT();
  return <span className={`status-chip st-${status}`}>{t.status[status]}</span>;
}

export const shortDate = (d: string, locale: string) => fmtDate(d, locale, { day: 'numeric', month: 'long' });

// One homework, the way a parent needs it: subject, language, what to do, dates, status.
// Read-only: the only action changes this device's personal "completed" mark.
export const HomeworkCard = memo(function HomeworkCard({ hw, status, today, onToggle }: {
  hw: Homework; status: ParentStatus; today: string; onToggle?: (id: string) => void;
}) {
  const { t } = useT();
  const done = status === 'completed';
  const dueNote = !done && hw.due_date === today ? t.status.dueToday : !done && hw.due_date === addDays(today, 1) ? t.status.dueTomorrow : null;
  return (
    <article className={`hw-card${done ? ' is-done' : ''}`} data-hw-id={hw.id} data-testid="hw-card">
      <div className="hw-head">
        <h3 className="hw-subject"><span aria-hidden>{hw.emoji ?? '📘'}</span> {hw.subject.toLocaleUpperCase()}</h3>
        <div className="row-wrap" style={{ justifyContent: 'flex-end' }}>
          {hw.is_new && <span className="pill new">{t.status.new}</span>}
          <LanguageBadge lang={hw.language} />
        </div>
      </div>
      <p className="hw-title">{hw.title}</p>
      <div className="hw-dates">
        <span>{t.hw.start}: <strong>{shortDate(hw.start_date, t.locale)}</strong></span>
        <span>{t.hw.due}: <strong>{shortDate(hw.due_date, t.locale)}</strong>{dueNote && <em className="due-note"> · {dueNote}</em>}</span>
      </div>
      <div className="hw-foot">
        <StatusChip status={status} />
        <div className="row" style={{ gap: 6 }}>
          {onToggle && (
            <button type="button" className={`btn small ${done ? 'secondary' : 'ghost'} mark-btn`} aria-pressed={done}
              onClick={() => onToggle(hw.id)} title={t.hw.personal}>
              <span className={`mini-box${done ? ' on' : ''}`}>{done && <IconCheck />}</span>
              <span className="mark-label">{done ? t.status.completed.replace('🟢 ', '') : t.hw.markDone}</span>
            </button>
          )}
          <Link className="btn small secondary" to={`/tarea/${hw.id}`}>{t.hw.details}</Link>
        </div>
      </div>
    </article>
  );
});

function relative(fromIso: string, locale: string) {
  const mins = Math.round((Date.now() - new Date(fromIso).getTime()) / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (mins < 60) return rtf.format(-mins, 'minute');
  if (mins < 60 * 48) return rtf.format(-Math.round(mins / 60), 'hour');
  return rtf.format(-Math.round(mins / 1440), 'day');
}

// "Last updated: October 8, 2026 — 10:00 AM" (+ a plain warning when it is not recent).
export function LastUpdated({ at }: { at: string | null }) {
  const { t } = useT();
  if (!at) return <p className="small faint" data-testid="last-updated">{t.updated.never}</p>;
  const d = new Date(at);
  const when = `${new Intl.DateTimeFormat(t.locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(d)} — ${new Intl.DateTimeFormat(t.locale, { hour: 'numeric', minute: '2-digit' }).format(d)}`;
  const stale = Date.now() - d.getTime() > STALE_AFTER_HOURS * 36e5;
  return (
    <div className="small" data-testid="last-updated">
      <p className="faint">🔄 {t.updated.last(when)}</p>
      {stale && <p className="stale-note">{t.updated.stale(relative(at, t.locale))}</p>}
    </div>
  );
}

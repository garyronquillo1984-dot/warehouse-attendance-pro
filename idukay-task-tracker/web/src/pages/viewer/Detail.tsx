import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useViewer } from '../../lib/viewer';
import { useMarks } from '../../lib/marks';
import { useT } from '../../lib/i18n';
import { fmtDate } from '../../lib/dates';
import { parentStatus } from '../../lib/status';
import type { Homework } from '../../lib/types';
import { LanguageBadge, StatusChip } from '../../components/Homework';
import { Empty, Spinner } from '../../components/ui';
import { IconCheck, IconChevL } from '../../components/Icons';

// The full homework, exactly as published. The original instructions are the authority; a
// parent explanation, when there is one, is shown separately and never replaces them.
export function DetailPage() {
  const { id = '' } = useParams();
  const v = useViewer();
  const { t } = useT();
  const nav = useNavigate();
  const { markedOn, toggle } = useMarks(v.student!.id);
  const cached = v.homework.find(h => h.id === id) ?? null;
  const [hw, setHw] = useState<Homework | null | undefined>(cached ?? undefined);
  useEffect(() => { if (!cached) v.fetchDetail(id).then(setHw); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);
  useEffect(() => { window.scrollTo(0, 0); }, [id]);

  if (hw === undefined) return <Spinner />;
  if (hw === null) return <Empty icon="🔎">{t.hw.notFound}</Empty>;
  const status = parentStatus(hw, v.today, markedOn(hw.id));
  const long = (d: string) => fmtDate(d, t.locale, { day: 'numeric', month: 'long', year: 'numeric' });
  const done = status === 'completed';

  return (
    <article className="stack detail" data-testid="hw-detail">
      <button type="button" className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => (history.length > 1 ? nav(-1) : nav('/hoy'))}><IconChevL />{t.common.back}</button>
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <h1 className="detail-subject"><span aria-hidden>{hw.emoji ?? '📘'}</span> {hw.subject.toLocaleUpperCase()}</h1>
        <LanguageBadge lang={hw.language} />
      </div>

      <section className="card card-pad stack-sm" lang={hw.language === 'other' ? undefined : hw.language}>
        <div className="eyebrow">{t.lang.homeworkIn[hw.language]}</div>
        <h2 className="detail-title">{hw.title}</h2>
        {hw.instructions && hw.instructions !== hw.title && <div className="desc" data-testid="original">{hw.instructions}</div>}
      </section>

      {hw.language === 'en' && <div className="english-banner" role="note" data-testid="english-banner">🇺🇸 {t.lang.answerEnglish}</div>}

      <dl className="kv">
        <dt>{t.hw.start}</dt><dd>{long(hw.start_date)}</dd>
        <dt>{t.hw.due}</dt><dd>{long(hw.due_date)}</dd>
        <dt>{t.hw.status}</dt><dd><StatusChip status={status} /></dd>
        {hw.teacher && <><dt>{t.hw.teacher}</dt><dd>{hw.teacher}</dd></>}
        <dt>{t.hw.source}</dt><dd>{t.hw.sources[hw.source]}</dd>
      </dl>

      {(hw.parent_explanation || hw.language === 'en') && (
        <section className="card card-pad stack-sm parent-help" lang="es">
          <div className="eyebrow">💬 {t.lang.parentHelp}{hw.parent_explanation ? ' — ESPAÑOL' : ''}</div>
          {hw.parent_explanation ? <div data-testid="parent-explanation">{hw.parent_explanation}</div> : <p className="muted small">{t.lang.noParentHelp}</p>}
        </section>
      )}

      {hw.notes && <div className="desc" style={{ background: 'var(--yellow-soft)' }}>📝 {hw.notes}</div>}
      {hw.attachments.length > 0 && (
        <section className="stack-sm"><div className="eyebrow">📎 {t.hw.attachments}</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{hw.attachments.map((a, i) => <li key={i}>{a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer">{a.name}</a> : a.name}</li>)}</ul>
        </section>
      )}
      {hw.revised && <p className="small muted">ℹ️ {t.hw.revised}</p>}

      {status !== 'upcoming' && (
        <button type="button" className={`btn big ${done ? 'secondary' : ''}`} aria-pressed={done} onClick={() => toggle(hw.id, v.today)} data-testid="detail-mark">
          {done ? <><IconCheck /> {t.hw.unmark}</> : t.hw.markDone}
        </button>
      )}
      <p className="small faint" style={{ textAlign: 'center' }}>{t.hw.personal} · {t.today.marksNote}</p>
    </article>
  );
}

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useT } from '../lib/i18n';
import { fmtDateTime } from '../lib/dates';
import type { Notification } from '../lib/types';
import { IconBell } from './Icons';
import { Sheet } from './ui';

// In-app reminders written by the scheduled job (morning / evening / tomorrow).
export function NotificationsButton() {
  const { t } = useT();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const load = () => supabase.from('notifications').select('id, kind, title, body, created_at, read_at')
    .order('created_at', { ascending: false }).limit(30).then(({ data }) => { if (data) setItems(data as Notification[]); });
  useEffect(() => {
    void load();
    const id = setInterval(load, 5 * 60_000);
    return () => clearInterval(id);
  }, []);
  const unread = items.filter(n => !n.read_at).length;
  const markAll = async () => { await supabase.rpc('mark_all_notifications_read'); void load(); };
  return (
    <>
      <button type="button" className="icon-btn" onClick={() => setOpen(true)} aria-label={`${t.notif.title}${unread ? ` (${unread})` : ''}`}>
        <IconBell />{unread > 0 && <span className="badge-dot">{unread}</span>}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={<h2>{t.notif.title}</h2>}>
        {items.length === 0 ? <p className="muted">{t.notif.empty}</p> : (
          <div className="stack-sm">
            {items.map(n => (
              <div key={n.id} className="card card-pad" style={{ opacity: n.read_at ? .7 : 1 }}>
                <div className="spread"><strong>{n.title}</strong><span className="small faint">{fmtDateTime(n.created_at, t.locale)}</span></div>
                {n.body && <p className="muted">{n.body}</p>}
              </div>
            ))}
            {unread > 0 && <button type="button" className="btn secondary" onClick={markAll}>{t.notif.markAll}</button>}
          </div>
        )}
      </Sheet>
    </>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAccount } from '../lib/account';
import { useFamily } from '../lib/family';
import { useT, type Lang } from '../lib/i18n';
import type { Settings } from '../lib/types';
import { Field, useToast } from '../components/ui';
import { COUNTRIES } from './Signup';

export function SettingsPage() {
  const { account, refresh } = useAccount();
  const fam = useFamily();
  const { t, setLang } = useT();
  const toast = useToast();
  const nav = useNavigate();
  const [name, setName] = useState(account?.full_name ?? '');
  const [phone, setPhone] = useState(account?.phone ?? '');
  const [country, setCountry] = useState(account?.country ?? '');
  const [locale, setLocale] = useState<Lang>(account?.locale ?? 'es');
  const [tz, setTz] = useState(account?.timezone ?? 'America/Guayaquil');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const hasSample = fam.children.some(c => c.is_sample);
  const locked = account?.access === 'locked';

  useEffect(() => {
    supabase.from('user_settings').select('morning_enabled, morning_time, evening_enabled, evening_time, tomorrow_enabled, tomorrow_time, email_reminders, push_reminders')
      .single().then(({ data }) => { if (data) setSettings(data as Settings); });
  }, []);
  if (!account) return null;

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ full_name: name.trim(), phone: phone.trim() || null, country: country || null, locale, timezone: tz }).eq('id', account.user_id);
    setBusy(false);
    if (error) { toast(t.common.error, 'error'); return; }
    setLang(locale); await refresh(); toast(t.settings.saved);
  };
  const saveSettings = async (patch: Partial<Settings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    const { error } = await supabase.from('user_settings').update(patch).eq('user_id', account.user_id);
    if (error) { setSettings(settings); toast(t.common.error, 'error'); }
  };
  const exportData = async () => {
    const { data, error } = await supabase.rpc('export_my_data');
    if (error) { toast(t.common.error, 'error'); return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `my-data-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const sample = async (load: boolean) => {
    const { error } = await supabase.rpc(load ? 'load_sample_data' : 'remove_sample_data');
    if (error) toast(t.common.error, 'error'); else { await fam.reload(); toast(t.settings.saved); }
  };
  const wipe = async () => {
    if (!confirm(t.settings.wipeConfirm)) return;
    const { error } = await supabase.rpc('wipe_my_data');
    if (error) toast(t.common.error, 'error'); else { await fam.reload(); toast(t.settings.wiped); }
  };
  const deleteAccount = async () => {
    const { error } = await supabase.rpc('delete_my_account');
    if (error) { toast(t.common.error, 'error'); return; }
    await supabase.auth.signOut();
    nav('/?deleted=1');
  };
  const timezones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [tz];

  const reminder = (key: 'morning' | 'evening' | 'tomorrow', ex: string) => settings && (
    <div className="switch" style={{ borderTop: '1px solid var(--border)' }}>
      <div className="grow"><strong>{t.settings[key]}</strong><div className="small muted">{ex}</div></div>
      <input type="time" className="input" style={{ width: 120, minHeight: 40 }} value={settings[`${key}_time`].slice(0, 5)} disabled={locked}
        onChange={e => saveSettings({ [`${key}_time`]: e.target.value } as Partial<Settings>)} aria-label={t.settings[key]} />
      <input type="checkbox" checked={settings[`${key}_enabled`]} disabled={locked} onChange={e => saveSettings({ [`${key}_enabled`]: e.target.checked } as Partial<Settings>)} aria-label={t.settings[key]} />
    </div>
  );

  return (
    <div className="stack">
      <h1>{t.settings.title}</h1>

      <form className="card card-pad stack" onSubmit={saveProfile}>
        <h3>{t.settings.profile}</h3>
        <p className="small muted">{account.email}</p>
        <Field label={t.auth.fullName}><input value={name} onChange={e => setName(e.target.value)} required maxLength={120} /></Field>
        <div className="grid-2">
          <Field label={t.auth.phone}><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} maxLength={30} /></Field>
          <Field label={t.auth.country}>
            <select value={country} onChange={e => setCountry(e.target.value)}>
              <option value="">—</option>
              {COUNTRIES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </Field>
          <Field label={t.settings.language}>
            <select value={locale} onChange={e => setLocale(e.target.value as Lang)}><option value="es">Español</option><option value="en">English</option></select>
          </Field>
          <Field label={t.settings.timezone}>
            <select value={tz} onChange={e => setTz(e.target.value)}>{timezones.map(z => <option key={z} value={z}>{z}</option>)}</select>
          </Field>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" disabled={busy}>{t.common.save}</button></div>
      </form>

      <div className="card card-pad">
        <h3>{t.settings.reminders}</h3>
        {reminder('morning', t.settings.morningEx)}
        {reminder('evening', t.settings.eveningEx)}
        {reminder('tomorrow', t.settings.tomorrowEx)}
        <div className="small muted" style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <strong>{t.settings.channels}:</strong> {t.settings.inApp} · {t.settings.emailSoon} · {t.settings.pushSoon}
        </div>
      </div>

      {!locked && (
        <div className="card card-pad stack-sm">
          <h3>{t.settings.sample}</h3>
          {hasSample
            ? <button type="button" className="btn secondary" onClick={() => sample(false)}>{t.settings.removeSample}</button>
            : <button type="button" className="btn secondary" onClick={() => sample(true)}>{t.settings.loadSample}</button>}
        </div>
      )}

      <div className="card card-pad stack-sm">
        <h3>{t.settings.privacy}</h3>
        <button type="button" className="btn secondary" onClick={exportData}>{t.settings.export}</button>
        <button type="button" className="btn secondary" onClick={wipe}>{t.settings.wipe}</button>
        <details>
          <summary className="btn ghost" style={{ color: 'var(--red)', listStyle: 'none' }}>{t.settings.deleteAccount}</summary>
          <div className="stack-sm" style={{ marginTop: 10 }}>
            <p className="small muted">{t.settings.deleteWarn}</p>
            <Field label={t.settings.deleteType}><input value={confirmText} onChange={e => setConfirmText(e.target.value)} autoComplete="off" /></Field>
            <button type="button" className="btn danger" disabled={confirmText.trim().toUpperCase() !== t.settings.deleteWord} onClick={deleteAccount}>{t.settings.deleteAccount}</button>
          </div>
        </details>
      </div>
    </div>
  );
}

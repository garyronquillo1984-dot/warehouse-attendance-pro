import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useOrg, canManage } from '../lib/org';
import { friendlyError } from '../lib/errors';
import { timezoneOptions } from '../lib/time';
import type { Shift, Warehouse } from '../lib/types';
import { Field, Loading, Notice } from '../components/ui';
import { ShiftEditor, validateShifts } from '../components/ShiftEditor';

type Msg = { kind: 'ok' | 'error'; text: string } | null;

export default function Settings() {
  const { current, refresh } = useOrg();
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');
  const [warehouses, setWarehouses] = useState<Warehouse[] | null>(null);
  const [companyMsg, setCompanyMsg] = useState<Msg>(null);
  const [newWh, setNewWh] = useState('');
  const [whMsg, setWhMsg] = useState<Msg>(null);

  const orgId = current?.organization_id;

  const load = useCallback(async () => {
    if (!orgId) return;
    const { data: org } = await supabase.from('organizations').select('name, timezone').eq('id', orgId).single();
    if (org) { setName(org.name); setTimezone(org.timezone); }
    const { data: wh } = await supabase.from('warehouses').select('id, organization_id, name, is_active')
      .eq('organization_id', orgId).order('created_at');
    setWarehouses((wh ?? []) as Warehouse[]);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  if (!current) return <Loading />;
  if (!canManage(current)) return <Navigate to="/" replace />;
  if (!warehouses) return <Loading />;

  async function saveCompany(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from('organizations').update({ name: name.trim(), timezone }).eq('id', orgId!);
    setCompanyMsg(error ? { kind: 'error', text: friendlyError(error) } : { kind: 'ok', text: 'Company saved.' });
    if (!error) await refresh();
  }

  async function addWarehouse(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from('warehouses').insert({ organization_id: orgId, name: newWh.trim() });
    setWhMsg(error ? { kind: 'error', text: friendlyError(error) } : { kind: 'ok', text: `${newWh.trim()} added. Set its shifts below.` });
    if (!error) { setNewWh(''); await load(); }
  }

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1>Settings</h1>
        <p className="muted">Company details, warehouses and shifts.</p>
      </div>

      <form className="panel" onSubmit={saveCompany}>
        <h2>Company</h2>
        {companyMsg && <Notice kind={companyMsg.kind}>{companyMsg.text}</Notice>}
        <Field label="Company name" name="company" maxLength={120} required value={name} onChange={e => setName(e.target.value)} />
        <div className="field">
          <label htmlFor="tz">Time zone</label>
          <select id="tz" value={timezone} onChange={e => setTimezone(e.target.value)}>
            {timezoneOptions(timezone).map(z => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" style={{ justifySelf: 'start' }} disabled={!name.trim()}>Save company</button>
      </form>

      {warehouses.map(w => <WarehouseShifts key={w.id} orgId={orgId!} warehouse={w} />)}

      <form className="panel" onSubmit={addWarehouse}>
        <h2>Add a warehouse</h2>
        {whMsg && <Notice kind={whMsg.kind}>{whMsg.text}</Notice>}
        <Field label="Warehouse name" name="new_warehouse" maxLength={120} value={newWh} onChange={e => setNewWh(e.target.value)} />
        <button className="btn btn-ghost" style={{ justifySelf: 'start' }} disabled={!newWh.trim()}>Add warehouse</button>
      </form>
    </div>
  );
}

function WarehouseShifts({ orgId, warehouse }: { orgId: string; warehouse: Warehouse }) {
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('shifts')
      .select('id, name, start_time, end_time, days, late_grace_minutes, is_active, sort_order')
      .eq('warehouse_id', warehouse.id).order('sort_order');
    setShifts(((data ?? []) as Shift[]).map(s => ({ ...s, start_time: s.start_time.slice(0, 5), end_time: s.end_time.slice(0, 5) })));
    setRemoved([]);
  }, [warehouse.id]);

  useEffect(() => { load(); }, [load]);
  if (!shifts) return <section className="panel"><h2>{warehouse.name}</h2><p className="muted">Loading shifts…</p></section>;

  async function save(e: FormEvent) {
    e.preventDefault();
    const invalid = validateShifts(shifts!);
    if (invalid) return setMsg({ kind: 'error', text: invalid });
    setBusy(true); setMsg(null);
    try {
      for (const id of removed) {
        const { error } = await supabase.from('shifts').delete().eq('id', id);
        if (error) throw error.code === '23503'
          ? new Error('A removed shift still has employees or attendance. Turn it off instead of removing it.')
          : error;
      }
      for (const [i, s] of shifts!.entries()) {
        const fields = { name: s.name.trim(), start_time: s.start_time, end_time: s.end_time, days: s.days,
                         late_grace_minutes: s.late_grace_minutes, is_active: s.is_active, sort_order: i };
        const { error } = s.id
          ? await supabase.from('shifts').update(fields).eq('id', s.id)
          : await supabase.from('shifts').insert({ ...fields, organization_id: orgId, warehouse_id: warehouse.id });
        if (error) throw error;
      }
      setMsg({ kind: 'ok', text: 'Shifts saved.' });
      await load();
    } catch (err) {
      setMsg({ kind: 'error', text: friendlyError(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={save}>
      <h2>Shifts · {warehouse.name}</h2>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {!shifts.length && <p className="muted">No shifts yet. Add the first one.</p>}
      {shifts.map((s, i) => (
        <ShiftEditor key={s.id ?? `new-${i}`} index={i} shift={s} idPrefix={`wh-${warehouse.id.slice(0, 8)}`}
          onChange={next => setShifts(shifts.map((x, j) => (j === i ? next : x)))}
          onRemove={() => { if (s.id) setRemoved([...removed, s.id]); setShifts(shifts.filter((_, j) => j !== i)); }} />
      ))}
      <div className="row">
        <button type="button" className="btn btn-ghost"
                onClick={() => setShifts([...shifts, { name: `Shift ${shifts.length + 1}`, start_time: '', end_time: '', days: [1, 2, 3, 4, 5], late_grace_minutes: 5, is_active: true }])}>
          Add shift
        </button>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save shifts'}</button>
      </div>
    </form>
  );
}

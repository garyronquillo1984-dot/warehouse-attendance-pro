import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { friendlyError } from '../lib/errors';
import type { MyOrg, Role, Warehouse } from '../lib/types';
import { Notice } from './ui';

interface Member { user_id: string; full_name: string | null; email: string; role: Role; warehouse_ids: string[]; joined_at: string }
interface Invite { id: string; email: string; role: Role; warehouse_ids: string[]; expires_at: string; created_at: string }
type Msg = { kind: 'ok' | 'error' | 'info'; text: string } | null;

const ROLE_HELP: Record<Role, string> = {
  owner: 'Everything, including billing and transferring the company.',
  admin: 'Everything except changing the owner. Manages employees, shifts and the team.',
  supervisor: 'Takes attendance and sees reports for the warehouses you choose.',
};

export default function Team({ org, warehouses }: { org: MyOrg; warehouses: Warehouse[] }) {
  const { session } = useAuth();
  const me = session?.user.id;
  const isOwner = org.role === 'owner';
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('supervisor');
  const [whs, setWhs] = useState<string[]>(warehouses.length === 1 ? [warehouses[0].id] : []);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [m, i] = await Promise.all([
      supabase.rpc('team_members', { org: org.organization_id }),
      supabase.from('invitations').select('id, email, role, warehouse_ids, expires_at, created_at')
        .eq('organization_id', org.organization_id).is('accepted_at', null).gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false }),
    ]);
    if (m.error) setMsg({ kind: 'error', text: friendlyError(m.error) });
    setMembers((m.data ?? []) as Member[]);
    setInvites((i.data ?? []) as Invite[]);
  }, [org.organization_id]);

  useEffect(() => { load(); }, [load]);

  const whName = (id: string) => warehouses.find(w => w.id === id)?.name ?? 'Removed warehouse';
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]);

  async function invite(e: FormEvent) {
    e.preventDefault();
    if (role === 'supervisor' && !whs.length) return setMsg({ kind: 'error', text: 'Choose at least one warehouse for a supervisor.' });
    setBusy(true); setMsg(null); setLink(null);
    const { data, error } = await supabase.rpc('create_invitation', {
      org: org.organization_id, invite_email: email.trim(), invite_role: role, warehouse_ids: role === 'supervisor' ? whs : [],
    });
    setBusy(false);
    if (error) return setMsg({ kind: 'error', text: friendlyError(error) });
    setLink({ email: email.trim(), url: `${window.location.origin}/invite?token=${data}` });
    setEmail('');
    load();
  }

  async function copy() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link.url); setMsg({ kind: 'ok', text: 'Link copied.' }); }
    catch { setMsg({ kind: 'info', text: 'Select the link and copy it.' }); }
  }

  async function revoke(id: string) {
    const { error } = await supabase.rpc('revoke_invitation', { invitation: id });
    const cancelled = invites.find(i => i.id === id);
    if (!error && cancelled && link?.email.toLowerCase() === cancelled.email.toLowerCase()) setLink(null);
    setMsg(error ? { kind: 'error', text: friendlyError(error) } : { kind: 'ok', text: 'Invitation cancelled. That link no longer works.' });
    load();
  }

  async function saveMember(m: Member, newRole: Role, newWhs: string[]) {
    const { error } = await supabase.rpc('update_member', { org: org.organization_id, member: m.user_id, new_role: newRole, warehouse_ids: newRole === 'supervisor' ? newWhs : [] });
    setMsg(error ? { kind: 'error', text: friendlyError(error) } : { kind: 'ok', text: `${m.full_name || m.email} updated.` });
    if (!error) setEditing(null);
    load();
  }

  async function remove(m: Member) {
    const { error } = await supabase.rpc('remove_member', { org: org.organization_id, member: m.user_id });
    setMsg(error ? { kind: 'error', text: friendlyError(error) } : { kind: 'ok', text: `${m.full_name || m.email} no longer has access.` });
    load();
  }

  async function transfer(m: Member) {
    const { error } = await supabase.rpc('transfer_ownership', { org: org.organization_id, new_owner: m.user_id });
    if (error) return setMsg({ kind: 'error', text: friendlyError(error) });
    window.location.reload();     // my own role changed: reload everything
  }

  return (
    <section className="panel" aria-labelledby="team-h">
      <h2 id="team-h">Team</h2>
      <p className="muted">People who can sign in to {org.name}. Each person uses their own email and password.</p>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      {!members ? <p className="muted">Loading team…</p> : (
        <ul className="team-list">
          {members.map(m => (
            <li key={m.user_id}>
              <div className="who">
                <span className="name">{m.full_name || m.email}{m.user_id === me ? ' (you)' : ''}</span>
                <span className="meta">{m.email} · {m.role[0].toUpperCase() + m.role.slice(1)}
                  {m.role === 'supervisor' && <> · {m.warehouse_ids.length ? m.warehouse_ids.map(whName).join(', ') : 'no warehouse yet'}</>}</span>
              </div>
              {m.role !== 'owner' && m.user_id !== me && (isOwner || m.role === 'supervisor') && editing !== m.user_id && (
                <button className="btn btn-ghost" onClick={() => setEditing(m.user_id)}>Change</button>
              )}
              {editing === m.user_id && (
                <MemberEditor member={m} warehouses={warehouses} canMakeAdmin={isOwner} canTransfer={isOwner && m.role === 'admin'}
                              onSave={saveMember} onRemove={remove} onTransfer={transfer} onCancel={() => setEditing(null)} />
              )}
            </li>
          ))}
        </ul>
      )}

      {invites.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <h3>Waiting to accept</h3>
          <ul className="team-list">
            {invites.map(i => (
              <li key={i.id}>
                <div className="who">
                  <span className="name">{i.email}</span>
                  <span className="meta">{i.role[0].toUpperCase() + i.role.slice(1)} · link works until {new Date(i.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>
                <button className="btn btn-ghost" onClick={() => revoke(i.id)}>Cancel invitation</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form className="invite-form stack" onSubmit={invite}>
        <h3>Invite someone</h3>
        <div className="two">
          <div className="field">
            <label htmlFor="inv-email">Their email</label>
            <input id="inv-email" type="email" required maxLength={200} value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com" />
          </div>
          <div className="field">
            <label htmlFor="inv-role">Role</label>
            <select id="inv-role" value={role} onChange={e => setRole(e.target.value as Role)}>
              <option value="supervisor">Supervisor</option>
              {isOwner && <option value="admin">Admin</option>}
            </select>
            <span className="hint">{ROLE_HELP[role]}</span>
          </div>
        </div>
        {role === 'supervisor' && (
          <fieldset className="wh-pick">
            <legend>Warehouses they can work in</legend>
            {warehouses.map(w => (
              <label key={w.id} className="check"><input type="checkbox" checked={whs.includes(w.id)} onChange={() => setWhs(toggle(whs, w.id))} /> {w.name}</label>
            ))}
          </fieldset>
        )}
        <button className="btn btn-primary" style={{ justifySelf: 'start' }} disabled={busy || !email.trim()}>{busy ? 'Creating…' : 'Create invitation link'}</button>
        {link && (
          <div className="invite-link">
            <p><strong>Send this link to {link.email}</strong> by text, WhatsApp or email. It works once, for that email only, for 7 days.</p>
            <div className="row">
              <input readOnly value={link.url} onFocus={e => e.target.select()} aria-label="Invitation link" />
              <button type="button" className="btn btn-primary" onClick={copy}>Copy link</button>
            </div>
          </div>
        )}
      </form>
    </section>
  );
}

function MemberEditor({ member, warehouses, canMakeAdmin, canTransfer, onSave, onRemove, onTransfer, onCancel }: {
  member: Member; warehouses: Warehouse[]; canMakeAdmin: boolean; canTransfer: boolean;
  onSave: (m: Member, r: Role, w: string[]) => void; onRemove: (m: Member) => void; onTransfer: (m: Member) => void; onCancel: () => void;
}) {
  const [role, setRole] = useState<Role>(member.role);
  const [whs, setWhs] = useState<string[]>(member.warehouse_ids);
  const [confirm, setConfirm] = useState<'remove' | 'transfer' | null>(null);
  return (
    <div className="member-edit stack">
      <div className="field" style={{ maxWidth: 240 }}>
        <label htmlFor={`role-${member.user_id}`}>Role</label>
        <select id={`role-${member.user_id}`} value={role} onChange={e => setRole(e.target.value as Role)}>
          <option value="supervisor">Supervisor</option>
          {(canMakeAdmin || member.role === 'admin') && <option value="admin">Admin</option>}
        </select>
      </div>
      {role === 'supervisor' && (
        <fieldset className="wh-pick">
          <legend>Warehouses</legend>
          {warehouses.map(w => (
            <label key={w.id} className="check"><input type="checkbox" checked={whs.includes(w.id)}
              onChange={() => setWhs(whs.includes(w.id) ? whs.filter(x => x !== w.id) : [...whs, w.id])} /> {w.name}</label>
          ))}
        </fieldset>
      )}
      {!confirm && (
        <div className="row">
          <button className="btn btn-primary" onClick={() => onSave(member, role, whs)}>Save</button>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-ghost danger" onClick={() => setConfirm('remove')}>Remove access</button>
          {canTransfer && <button className="btn btn-ghost" onClick={() => setConfirm('transfer')}>Make owner</button>}
        </div>
      )}
      {confirm === 'remove' && (
        <div className="row">
          <span>Remove {member.full_name || member.email}? Their past attendance entries stay.</span>
          <button className="btn btn-primary danger-fill" onClick={() => onRemove(member)}>Yes, remove access</button>
          <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Keep</button>
        </div>
      )}
      {confirm === 'transfer' && (
        <div className="row">
          <span>Make {member.full_name || member.email} the owner? You’ll become an admin.</span>
          <button className="btn btn-primary" onClick={() => onTransfer(member)}>Yes, transfer ownership</button>
          <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

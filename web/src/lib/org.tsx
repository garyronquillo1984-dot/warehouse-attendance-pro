import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';
import type { MyOrg } from './types';

const STORAGE_KEY = 'wap.currentOrg';

interface OrgState {
  orgs: MyOrg[];
  current: MyOrg | null;
  loading: boolean;
  error: string | null;
  select: (id: string) => void;
  refresh: () => Promise<MyOrg[]>;
}

const OrgContext = createContext<OrgState | null>(null);

function readStored(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}
function writeStored(id: string) {
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* private mode: fine */ }
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [orgs, setOrgs] = useState<MyOrg[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(readStored());
  const [error, setError] = useState<string | null>(null);

  const userId = session?.user.id ?? null;
  // Only the first load for a user blanks the screen; later refreshes (after renaming the
  // company, say) update in place so the page that asked keeps its state and messages.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) { setOrgs([]); setLoadedFor(null); return []; }
    const { data, error: err } = await supabase.rpc('my_organizations');
    setLoadedFor(userId);
    if (err) { setError(err.message); return []; }
    setError(null);
    const list = (data ?? []) as MyOrg[];
    setOrgs(list);
    return list;
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  const current = orgs.find(o => o.organization_id === currentId) ?? orgs[0] ?? null;

  const select = (id: string) => { setCurrentId(id); writeStored(id); };

  return (
    // A user whose companies haven't arrived yet is still loading, even in the render
    // before the fetch starts; otherwise the app would briefly think they have none.
    <OrgContext.Provider value={{ orgs, current, loading: !!userId && loadedFor !== userId, error, select, refresh }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used inside OrgProvider');
  return ctx;
}

export const canManage = (org: MyOrg | null) => !!org && (org.role === 'owner' || org.role === 'admin');

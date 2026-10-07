import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Warehouse } from './types';

export interface SetupStatus {
  loading: boolean;
  warehouses: Warehouse[];
  shiftCount: number;
  reload: () => Promise<void>;
}

// What the current company still needs before attendance can be tracked.
export function useSetupStatus(orgId: string | null | undefined, enabled = true): SetupStatus {
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [shiftCount, setShiftCount] = useState(0);

  const reload = useCallback(async () => {
    if (!orgId || !enabled) return;
    setReloading(true);
    const { data: wh } = await supabase.from('warehouses')
      .select('id, organization_id, name, is_active').eq('organization_id', orgId).order('created_at');
    const { count } = await supabase.from('shifts')
      .select('id', { count: 'exact', head: true }).eq('organization_id', orgId);
    setWarehouses((wh ?? []) as Warehouse[]);
    setShiftCount(count ?? 0);
    setLoadedFor(orgId);
    setReloading(false);
  }, [orgId, enabled]);

  useEffect(() => { reload(); }, [reload]);
  // Derived, so the render right after the company changes already counts as loading.
  const loading = !!orgId && enabled && (loadedFor !== orgId || reloading);
  return { loading, warehouses, shiftCount, reload };
}

const INVITE_KEY = 'wap.pendingInvite';
export const pendingInvite = {
  get: () => { try { return localStorage.getItem(INVITE_KEY); } catch { return null; } },
  set: (t: string) => { try { localStorage.setItem(INVITE_KEY, t); } catch { /* ignore */ } },
  clear: () => { try { localStorage.removeItem(INVITE_KEY); } catch { /* ignore */ } },
};

export const SUPPORT_EMAIL = (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) || '';

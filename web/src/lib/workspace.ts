import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { AbsenceReason, Department, Shift, Warehouse } from './types';

export interface WarehouseFull extends Warehouse { shifts: Shift[]; departments: Department[] }

export interface Workspace {
  loading: boolean;
  error: string | null;
  timezone: string;
  warehouses: WarehouseFull[];      // only the ones this person can see
  reasons: AbsenceReason[];
  reload: () => Promise<void>;
}

const SHIFT_COLS = 'id, warehouse_id, name, start_time, end_time, days, late_grace_minutes, is_active, sort_order';

// Everything the employee and attendance screens need about the company, in one load.
export function useWorkspace(orgId: string | undefined): Workspace {
  const [state, setState] = useState<Omit<Workspace, 'reload'>>({
    loading: true, error: null, timezone: 'America/New_York', warehouses: [], reasons: [],
  });

  const reload = useCallback(async () => {
    if (!orgId) return;
    const [org, wh, rs] = await Promise.all([
      supabase.from('organizations').select('timezone').eq('id', orgId).single(),
      supabase.from('warehouses')
        .select(`id, organization_id, name, is_active, shifts(${SHIFT_COLS}), departments(id, warehouse_id, name, is_active)`)
        .eq('organization_id', orgId).order('created_at'),
      supabase.from('absence_reasons').select('code, label, is_active, sort_order')
        .eq('organization_id', orgId).order('sort_order'),
    ]);
    const err = org.error || wh.error || rs.error;
    const warehouses = ((wh.data ?? []) as unknown as WarehouseFull[]).map(w => ({
      ...w,
      shifts: [...(w.shifts ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      departments: [...(w.departments ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    }));
    setState({
      loading: false,
      error: err ? err.message : null,
      timezone: org.data?.timezone ?? 'America/New_York',
      warehouses,
      reasons: ((rs.data ?? []) as AbsenceReason[]).filter(r => r.is_active),
    });
  }, [orgId]);

  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}

// Remembers the last warehouse a person worked in (per device).
const WH_KEY = 'wap.warehouse';
export const lastWarehouse = {
  get: () => { try { return localStorage.getItem(WH_KEY); } catch { return null; } },
  set: (id: string) => { try { localStorage.setItem(WH_KEY, id); } catch { /* private mode */ } },
};

export function pickWarehouse(list: WarehouseFull[], wanted: string | null): WarehouseFull | undefined {
  return list.find(w => w.id === wanted) ?? list.find(w => w.id === lastWarehouse.get()) ?? list[0];
}

export const fullName = (e: { first_name: string; last_name: string }) => `${e.last_name}, ${e.first_name}`;

// "New" = hasn't worked a first day yet, or did so within the last 7 days.
export function isNewEmployee(e: { first_attendance_date: string | null; status: string }, onDate: string): boolean {
  if (e.status !== 'active') return false;
  if (!e.first_attendance_date) return true;
  const days = (new Date(onDate + 'T12:00:00Z').getTime() - new Date(e.first_attendance_date + 'T12:00:00Z').getTime()) / 864e5;
  return days >= 0 && days < 7;
}

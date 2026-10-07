export type Role = 'owner' | 'admin' | 'supervisor';
export type LicenseStatus = 'trial' | 'active' | 'suspended' | 'cancelled' | 'expired';

export interface MyOrg {
  organization_id: string;
  name: string;
  role: Role;
  license_status: LicenseStatus | null;
  can_write: boolean;
  can_read: boolean;
}

export interface MyLicense {
  status: LicenseStatus;
  plan_code: string;
  plan_name: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  grace_until: string | null;
  can_write: boolean;
  can_read: boolean;
}

export interface Warehouse { id: string; organization_id: string; name: string; is_active: boolean }

export interface Shift {
  id?: string;
  organization_id?: string;
  warehouse_id?: string;
  name: string;
  start_time: string;   // HH:MM
  end_time: string;     // HH:MM
  days: number[];       // ISO weekday, 1 = Monday
  late_grace_minutes: number;
  is_active: boolean;
  sort_order?: number;
}

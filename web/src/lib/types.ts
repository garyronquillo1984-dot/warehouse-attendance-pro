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

export type EmployeeStatus = 'active' | 'inactive';
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';

export interface Department { id: string; warehouse_id: string; name: string; is_active: boolean }

export interface Employee {
  id: string;
  organization_id: string;
  warehouse_id: string;
  employee_code: string;      // badge ID
  first_name: string;
  last_name: string;
  shift_id: string | null;
  department_id: string | null;
  status: EmployeeStatus;
  hire_date: string | null;
  first_attendance_date: string | null;
}

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  work_date: string;
  shift_id: string | null;
  status: AttendanceStatus;
  reason_code: string | null;
  note: string | null;
}

export interface AbsenceReason { code: string; label: string; is_active: boolean; sort_order: number }

export const EMPLOYEE_COLUMNS = 'id, organization_id, warehouse_id, employee_code, first_name, last_name, shift_id, department_id, status, hire_date, first_attendance_date';

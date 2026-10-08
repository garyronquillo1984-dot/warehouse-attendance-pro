export type TaskStatus = 'pending' | 'in_progress' | 'completed';
export type TaskPriority = 'low' | 'normal' | 'high';
export type TaskSource = 'manual' | 'paste' | 'import' | 'integration' | 'sample';
export type Access = 'trial' | 'active' | 'grace' | 'locked';
export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAYMENT_PENDING' | 'PAYMENT_FAILED' | 'CANCELLED' | 'EXPIRED';

export interface Account {
  user_id: string;
  email: string;
  full_name: string;
  phone: string | null;
  country: string | null;
  locale: 'es' | 'en';
  timezone: string;
  onboarded: boolean;
  access: Access;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  status: SubscriptionStatus | null;
  current_period_end: string | null;
  cancelled_at: string | null;
  grace_days: number;
  is_admin: boolean;
}

export interface School { id: string; name: string }

export interface Child {
  id: string;
  name: string;
  grade: string | null;
  school_id: string | null;
  classroom: string | null;
  teacher: string | null;
  color: string;
  is_active: boolean;
  is_sample: boolean;
  sort_order: number;
  created_at: string;
}

export interface Task {
  id: string;
  child_id: string;
  subject: string;
  subject_id: string | null;
  title: string;
  description: string | null;
  assigned_date: string | null;
  due_date: string | null;
  due_time: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  estimated_minutes: number | null;
  teacher: string | null;
  notes: string | null;
  source: TaskSource;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type TaskInput = Pick<Task, 'child_id' | 'subject' | 'title'> &
  Partial<Pick<Task, 'description' | 'assigned_date' | 'due_date' | 'due_time' | 'priority' | 'status' | 'estimated_minutes' | 'teacher' | 'notes' | 'source'>>;

export interface StatusChange { id: number; from_status: TaskStatus | null; to_status: TaskStatus; changed_at: string }

export interface Notification {
  id: string; kind: string; title: string; body: string | null; created_at: string; read_at: string | null;
}

export interface Settings {
  morning_enabled: boolean; morning_time: string;
  evening_enabled: boolean; evening_time: string;
  tomorrow_enabled: boolean; tomorrow_time: string;
  email_reminders: boolean; push_reminders: boolean;
}

export type Lang = 'en' | 'es' | 'other';
export type Lifecycle = 'upcoming' | 'active' | 'archived';
/** What the parent sees for one homework on this device. */
export type ParentStatus = 'completed' | 'pending' | 'overdue' | 'upcoming' | 'archived';

export interface Homework {
  id: string;
  subject: string;
  emoji: string | null;
  title: string;
  instructions: string | null;        // original, authoritative
  parent_explanation: string | null;  // optional help for parents
  language: Lang;                     // language the student must use
  start_date: string;
  due_date: string;
  teacher: string | null;
  notes: string | null;
  attachments: Array<{ name: string; url?: string }>;
  source: 'manual' | 'idukay_paste' | 'idukay_api';
  status: Lifecycle;
  is_new: boolean;
  revised: boolean;
  updated_at: string;
  created_at: string;
}

export interface ViewerStudent {
  id: string;
  first_name: string;
  class_id: string;
  grade_label: string;
  grade_short: string;
  parallel: string;
  school_name: string | null;
  timezone: string;
  today: string;
  last_updated_at: string | null;
  last_sync_at: string | null;
}

export interface ViewerOpen {
  link: { label: string };
  students: ViewerStudent[];
  server_now: string;
}

// Recruiting module: types, option lists (bilingual), pipeline rules and shared loaders.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Lang, Labelled } from './i18n';

// ---------- pipeline ----------
export type Stage =
  | 'new' | 'pending_contact' | 'contacted' | 'interested' | 'prescreened' | 'application' | 'documents_pending'
  | 'checks_pending' | 'approved' | 'available' | 'assigned' | 'first_day_confirmed' | 'started' | 'retention' | 'closed';

// Interested ≠ pre-selected ≠ authorized to work: the phase makes the difference explicit everywhere.
export type Phase = 'lead' | 'preselected' | 'authorized' | 'working' | 'closed';

export const STAGES: (Labelled & { key: Stage; phase: Phase })[] = [
  { key: 'new', phase: 'lead', en: 'New candidate', es: 'Nuevo candidato' },
  { key: 'pending_contact', phase: 'lead', en: 'Pending contact', es: 'Pendiente de contacto' },
  { key: 'contacted', phase: 'lead', en: 'Contacted', es: 'Contactado' },
  { key: 'interested', phase: 'lead', en: 'Interested', es: 'Interesado' },
  { key: 'prescreened', phase: 'preselected', en: 'Pre-selected', es: 'Preselección' },
  { key: 'application', phase: 'preselected', en: 'Interview / formal application', es: 'Entrevista o solicitud formal' },
  { key: 'documents_pending', phase: 'preselected', en: 'Documents pending', es: 'Documentación pendiente' },
  { key: 'checks_pending', phase: 'preselected', en: 'Authorized checks pending', es: 'Verificaciones autorizadas pendientes' },
  { key: 'approved', phase: 'authorized', en: 'Approved by hiring process', es: 'Aprobado según el proceso' },
  { key: 'available', phase: 'authorized', en: 'Available for assignment', es: 'Disponible para asignación' },
  { key: 'assigned', phase: 'authorized', en: 'Assigned to a shift', es: 'Asignado a un turno' },
  { key: 'first_day_confirmed', phase: 'authorized', en: 'First day confirmed', es: 'Primer día confirmado' },
  { key: 'started', phase: 'working', en: 'Showed up to work', es: 'Se presentó a trabajar' },
  { key: 'retention', phase: 'working', en: 'Retention follow-up', es: 'Seguimiento de retención' },
  { key: 'closed', phase: 'closed', en: 'Not interested / not available / recontact', es: 'No interesado / no disponible / recontactar' },
];
export const STAGE_INDEX = Object.fromEntries(STAGES.map((s, i) => [s.key, i])) as Record<Stage, number>;
export const phaseOf = (s: Stage) => STAGES[STAGE_INDEX[s]].phase;
export const atLeast = (s: Stage, min: Stage) => s !== 'closed' && STAGE_INDEX[s] >= STAGE_INDEX[min];

export const PHASES: (Labelled & { key: Phase; hint: Labelled })[] = [
  { key: 'lead', en: 'Interested', es: 'Interesados',
    hint: { en: 'Showed interest. Not screened, not authorized.', es: 'Mostraron interés. Sin preselección ni autorización.' } },
  { key: 'preselected', en: 'Pre-selected', es: 'Preseleccionados',
    hint: { en: 'Meet the opening’s requirements. Hiring process not finished.', es: 'Cumplen los requisitos del puesto. Proceso de contratación sin terminar.' } },
  { key: 'authorized', en: 'Authorized to work', es: 'Autorizados para trabajar',
    hint: { en: 'Approved by the hiring process. Can be placed.', es: 'Aprobados por el proceso de contratación. Pueden asignarse.' } },
  { key: 'working', en: 'Working', es: 'Trabajando',
    hint: { en: 'Started work. Retention follow-up.', es: 'Ya trabajan. Seguimiento de retención.' } },
  { key: 'closed', en: 'Closed', es: 'Cerrados', hint: { en: 'Kept for recontact if consent allows.', es: 'Se guardan para recontactar si hay consentimiento.' } },
];

export const CLOSED_REASONS: (Labelled & { key: string })[] = [
  { key: 'not_interested', en: 'Not interested', es: 'No interesado' },
  { key: 'not_available', en: 'Not available', es: 'No disponible' },
  { key: 'recontact_later', en: 'Recontact later', es: 'Recontactar más tarde' },
  { key: 'no_show', en: 'Did not show up', es: 'No se presentó' },
  { key: 'did_not_meet_requirements', en: 'Did not meet job requirements', es: 'No cumplió requisitos del puesto' },
  { key: 'left_assignment', en: 'Left the assignment', es: 'Dejó la asignación' },
  { key: 'other_agency', en: 'Working with another agency', es: 'Trabaja con otra agencia' },
  { key: 'duplicate', en: 'Duplicate record', es: 'Registro duplicado' },
  { key: 'other', en: 'Other', es: 'Otro' },
];

// ---------- job-related options (objective, job-related only) ----------
export const POSITIONS: (Labelled & { key: string })[] = [
  { key: 'picking', en: 'Picking', es: 'Picking (surtido)' },
  { key: 'packing', en: 'Packing', es: 'Empaque' },
  { key: 'order_fulfillment', en: 'Order fulfillment', es: 'Preparación de pedidos' },
  { key: 'sorting', en: 'Sorting', es: 'Clasificación' },
  { key: 'material_handling', en: 'Material handling', es: 'Manejo de materiales' },
  { key: 'receiving', en: 'Receiving', es: 'Recepción' },
  { key: 'shipping', en: 'Shipping', es: 'Envíos' },
  { key: 'inventory', en: 'Inventory', es: 'Inventario' },
  { key: 'other', en: 'Other approved role', es: 'Otro puesto aprobado' },
];
export const EXPERIENCE: (Labelled & { key: string })[] = [
  ...POSITIONS.filter(p => p.key !== 'other'),
  { key: 'rf_scanner', en: 'RF scanner use', es: 'Uso de escáner RF' },
  { key: 'quality_check', en: 'Quality check', es: 'Control de calidad' },
  { key: 'none', en: 'No warehouse experience yet', es: 'Aún sin experiencia en almacén' },
];
export const EQUIPMENT: (Labelled & { key: string })[] = [
  { key: 'rf_scanner', en: 'RF scanner', es: 'Escáner RF' },
  { key: 'pallet_jack', en: 'Manual pallet jack', es: 'Patín manual' },
  { key: 'electric_pallet_jack', en: 'Electric pallet jack', es: 'Patín eléctrico' },
  { key: 'forklift', en: 'Forklift (certified)', es: 'Montacargas (certificado)' },
  { key: 'reach_truck', en: 'Reach truck', es: 'Reach truck' },
  { key: 'order_picker', en: 'Order picker', es: 'Order picker' },
  { key: 'label_printer', en: 'Label printer', es: 'Impresora de etiquetas' },
  { key: 'conveyor', en: 'Conveyor line', es: 'Banda transportadora' },
];
export const SHIFT_OPTIONS: (Labelled & { key: string })[] = [
  { key: 'first', en: '1st shift (day)', es: '1er turno (día)' },
  { key: 'second', en: '2nd shift (evening)', es: '2º turno (tarde)' },
  { key: 'third', en: '3rd shift (night)', es: '3er turno (noche)' },
  { key: 'weekend', en: 'Weekends', es: 'Fines de semana' },
  { key: 'flexible', en: 'Flexible', es: 'Flexible' },
];
export const LANGUAGES: (Labelled & { key: string })[] = [
  { key: 'en', en: 'English', es: 'Inglés' },
  { key: 'es', en: 'Spanish', es: 'Español' },
  { key: 'other', en: 'Other', es: 'Otro' },
];
export const SOURCE_KINDS: (Labelled & { key: string })[] = [
  { key: 'social', en: 'Social media', es: 'Redes sociales' },
  { key: 'job_board', en: 'Job board', es: 'Portal de empleo' },
  { key: 'referral', en: 'Referral', es: 'Referido' },
  { key: 'career_center', en: 'Career center', es: 'Centro de empleo' },
  { key: 'job_fair', en: 'Job fair', es: 'Feria de empleo' },
  { key: 'community_org', en: 'Community organization', es: 'Organización comunitaria' },
  { key: 'school', en: 'School / training', es: 'Escuela / formación' },
  { key: 'walk_in', en: 'Walk-in', es: 'Presencial' },
  { key: 'messaging', en: 'Messaging (opt-in)', es: 'Mensajería (con consentimiento)' },
  { key: 'digital_ad', en: 'Digital ad', es: 'Anuncio digital' },
  { key: 'other', en: 'Other', es: 'Otro' },
];
export const ACTIVITY_KINDS: (Labelled & { key: string })[] = [
  { key: 'job_fair', en: 'Job fair', es: 'Feria de empleo' },
  { key: 'community_visit', en: 'Community visit', es: 'Visita comunitaria' },
  { key: 'org_contact', en: 'Organization contact', es: 'Contacto con organización' },
  { key: 'school_meeting', en: 'School / training meeting', es: 'Reunión con institución educativa' },
  { key: 'digital_campaign', en: 'Digital campaign', es: 'Campaña digital' },
  { key: 'interview_day', en: 'Interview day', es: 'Jornada de entrevistas' },
  { key: 'event_follow_up', en: 'Post-event follow-up', es: 'Seguimiento posterior' },
  { key: 'agency_meeting', en: 'Agency coordination meeting', es: 'Reunión de coordinación entre agencias' },
  { key: 'other', en: 'Other', es: 'Otro' },
];
export const ACTIVITY_STATUS: (Labelled & { key: string })[] = [
  { key: 'idea', en: 'Idea', es: 'Idea' },
  { key: 'pending_confirmation', en: 'Pending confirmation', es: 'Pendiente de confirmación' },
  { key: 'confirmed', en: 'Confirmed', es: 'Confirmado' },
  { key: 'done', en: 'Done', es: 'Realizado' },
  { key: 'cancelled', en: 'Cancelled', es: 'Cancelado' },
];
export const OPENING_STATUS: (Labelled & { key: string })[] = [
  { key: 'draft', en: 'Draft (not authorized)', es: 'Borrador (sin autorizar)' },
  { key: 'authorized', en: 'Authorized', es: 'Autorizada' },
  { key: 'on_hold', en: 'On hold', es: 'En pausa' },
  { key: 'filled', en: 'Filled', es: 'Cubierta' },
  { key: 'closed', en: 'Closed', es: 'Cerrada' },
];
export const AGENCY_CHECK: (Labelled & { key: string })[] = [
  { key: 'unknown', en: 'Not asked yet', es: 'Aún no se preguntó' },
  { key: 'none', en: 'Not with another agency here', es: 'No está con otra agencia aquí' },
  { key: 'other_agency_reported', en: 'Says another agency placed them here — hold', es: 'Dice que otra agencia lo colocó aquí — en espera' },
  { key: 'cleared', en: 'Cleared by supervisor', es: 'Aclarado por el supervisor' },
];
export const EVENT_KINDS: (Labelled & { key: string })[] = [
  { key: 'call', en: 'Call', es: 'Llamada' },
  { key: 'sms', en: 'Text message', es: 'Mensaje de texto' },
  { key: 'whatsapp', en: 'WhatsApp', es: 'WhatsApp' },
  { key: 'email', en: 'Email', es: 'Correo' },
  { key: 'in_person', en: 'In person', es: 'En persona' },
  { key: 'note', en: 'Note', es: 'Nota' },
  { key: 'stage_change', en: 'Stage change', es: 'Cambio de etapa' },
  { key: 'message_prepared', en: 'Message prepared', es: 'Mensaje preparado' },
];
export const OUTCOMES: (Labelled & { key: string })[] = [
  { key: 'reached', en: 'Reached', es: 'Contestó' },
  { key: 'no_answer', en: 'No answer', es: 'No contestó' },
  { key: 'left_message', en: 'Left a message', es: 'Dejé mensaje' },
  { key: 'replied', en: 'Replied', es: 'Respondió' },
  { key: 'sent', en: 'Sent', es: 'Enviado' },
  { key: 'wrong_number', en: 'Wrong number', es: 'Número equivocado' },
  { key: 'other', en: 'Other', es: 'Otro' },
];

export const label = (list: (Labelled & { key: string })[], key: string | null | undefined, lang: Lang) =>
  (key && list.find(x => x.key === key)?.[lang]) || key || '—';

// ---------- rows ----------
export interface Candidate {
  id: string; organization_id: string; warehouse_id: string;
  first_name: string; last_name: string; phone: string | null; email: string | null;
  city: string | null; zip: string | null; preferred_language: string;
  source_id: string | null; source_detail: string | null; intake_form_id: string | null; owner_id: string | null;
  registered_at: string; experience: string[]; experience_note: string | null; equipment: string[];
  shifts_available: string[]; available_from: string | null; positions_wanted: string[];
  stage: Stage; stage_changed_at: string; closed_reason: string | null; recontact_on: string | null;
  opening_id: string | null; interview_at: string | null; first_day: string | null; employee_id: string | null;
  last_contact_at: string | null; next_action: string | null; next_action_due: string | null;
  consent_contact: boolean; consent_sms: boolean; consent_whatsapp: boolean; consent_email: boolean;
  consent_at: string | null; consent_method: string | null;
  agency_check: string; agency_note: string | null; notes: string | null;
  possible_duplicate_of: string | null; is_sample: boolean; created_at: string; updated_at: string;
}
export const CANDIDATE_COLUMNS = 'id, organization_id, warehouse_id, first_name, last_name, phone, email, city, zip, preferred_language, source_id, source_detail, intake_form_id, owner_id, registered_at, experience, experience_note, equipment, shifts_available, available_from, positions_wanted, stage, stage_changed_at, closed_reason, recontact_on, opening_id, interview_at, first_day, employee_id, last_contact_at, next_action, next_action_due, consent_contact, consent_sms, consent_whatsapp, consent_email, consent_at, consent_method, agency_check, agency_note, notes, possible_duplicate_of, is_sample, created_at, updated_at';

export interface Source { id: string; name: string; kind: string; url: string | null; contact_note: string | null; cost_note: string | null; monthly_cost: number | null; verified: boolean; is_active: boolean; created_at: string }
export interface Opening {
  id: string; warehouse_id: string; shift_id: string | null; title: string; position: string; headcount: number;
  status: string; authorized_by: string | null; authorized_on: string | null; pay_note: string | null;
  schedule_note: string | null; requirements_note: string | null; opened_on: string; target_date: string | null;
  filled_on: string | null; is_sample: boolean;
}
export interface Settings {
  organization_id: string; public_name: string; privacy_contact: string | null; stale_days: number;
  low_pool_threshold: number; retention_months: number; goal_contacts_day: number; goal_prescreens_week: number;
  goal_interviews_week: number; goal_show_rate: number; goal_retention_30: number;
  stage_labels: Partial<Record<Stage, Partial<Labelled>>>; hidden_stages: string[];
}
export interface Task {
  id: string; candidate_id: string | null; kind: string; title: string; due_on: string; assigned_to: string | null;
  auto_key: string | null; done_at: string | null; created_at: string;
}
export interface CandidateEvent {
  id: string; candidate_id: string; kind: string; outcome: string | null; body: string | null;
  stage_from: Stage | null; stage_to: Stage | null; created_by: string | null; created_at: string;
}
export interface Template { id: string; code: string; lang: Lang; channel: string; title: string; body: string; is_active: boolean; sort_order: number }
export interface Member { user_id: string; name: string }

export const DEFAULT_SETTINGS: Omit<Settings, 'organization_id'> = {
  public_name: 'Staffing team', privacy_contact: null, stale_days: 3, low_pool_threshold: 3, retention_months: 12,
  goal_contacts_day: 20, goal_prescreens_week: 10, goal_interviews_week: 5, goal_show_rate: 85, goal_retention_30: 70,
  stage_labels: {}, hidden_stages: [],
};

export function stageLabel(s: Stage, lang: Lang, settings?: Settings | null): string {
  return settings?.stage_labels?.[s]?.[lang] || STAGES[STAGE_INDEX[s]][lang];
}

// ---------- shared loader ----------
export interface RecruitingSetup {
  loading: boolean; error: string | null;
  settings: Settings | null; sources: Source[]; openings: Opening[]; members: Member[];
  reload: () => Promise<void>;
}

// Settings, sources, openings and the people work can be assigned to. Owner/Admin
// get the defaults created the first time (sources, bilingual templates, settings).
export function useRecruitingSetup(orgId: string | undefined, manage: boolean): RecruitingSetup {
  const [state, setState] = useState<Omit<RecruitingSetup, 'reload'>>({
    loading: true, error: null, settings: null, sources: [], openings: [], members: [],
  });
  const reload = useCallback(async () => {
    if (!orgId) return;
    let st = await supabase.from('recruitment_settings').select('*').eq('organization_id', orgId).maybeSingle();
    if (!st.data && manage) {
      await supabase.rpc('seed_recruitment_defaults', { org: orgId });
      st = await supabase.from('recruitment_settings').select('*').eq('organization_id', orgId).maybeSingle();
    }
    const [src, op, mem] = await Promise.all([
      supabase.from('recruitment_sources').select('*').eq('organization_id', orgId).order('name'),
      supabase.from('job_openings').select('*').eq('organization_id', orgId).order('opened_on', { ascending: false }),
      supabase.from('memberships').select('user_id').eq('organization_id', orgId),
    ]);
    const ids = (mem.data ?? []).map(m => m.user_id as string);
    const prof = ids.length ? await supabase.from('profiles').select('user_id, full_name').in('user_id', ids) : { data: [] };
    const names = new Map((prof.data ?? []).map(p => [p.user_id as string, (p.full_name as string | null) || '']));
    const err = st.error || src.error || op.error;
    setState({
      loading: false, error: err ? err.message : null,
      settings: (st.data as Settings | null) ?? null,
      sources: (src.data ?? []) as Source[],
      openings: (op.data ?? []) as Opening[],
      members: ids.map(id => ({ user_id: id, name: names.get(id) || 'Team member' })),
    });
  }, [orgId, manage]);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}

// ---------- matching and readiness (objective, job-related criteria only) ----------
// Pool for an authorized opening: pre-selected or authorized, not yet working, not on hold
// because another agency placed them, and either tied to the opening or matching its role.
export function inPool(c: Candidate, o: Opening): boolean {
  if (c.warehouse_id !== o.warehouse_id || c.employee_id) return false;
  if (!atLeast(c.stage, 'prescreened') || atLeast(c.stage, 'started')) return false;
  if (c.agency_check === 'other_agency_reported') return false;
  return c.opening_id === o.id || (!c.opening_id && (c.positions_wanted.includes(o.position) || c.positions_wanted.length === 0));
}

// 0–100. Uses only what the job needs: availability date, shift, relevant experience,
// equipment, recency of contact. Shown with its reasons so nobody has to trust a black box.
export const READINESS_REASONS: Record<string, Labelled> = {
  available_now: { en: 'available now', es: 'disponible ya' },
  available_soon: { en: 'available within 7 days', es: 'disponible en 7 días' },
  shift_match: { en: 'shift match', es: 'turno compatible' },
  role_experience: { en: 'experience in the role', es: 'experiencia en el puesto' },
  warehouse_experience: { en: 'warehouse experience', es: 'experiencia en almacén' },
  equipment: { en: 'equipment', es: 'equipos' },
  recent_contact: { en: 'contacted this week', es: 'contactado esta semana' },
};
export function readiness(c: Candidate, today: string, opening?: Opening, shiftKey?: string): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const days = c.available_from ? (Date.parse(c.available_from) - Date.parse(today)) / 864e5 : 0;
  if (days <= 0) { score += 30; reasons.push('available_now'); }
  else if (days <= 7) { score += 20; reasons.push('available_soon'); }
  if (shiftKey ? c.shifts_available.includes(shiftKey) || c.shifts_available.includes('flexible') : c.shifts_available.length > 0) { score += 25; reasons.push('shift_match'); }
  if (opening && c.experience.includes(opening.position)) { score += 20; reasons.push('role_experience'); }
  else if (c.experience.some(e => e !== 'none')) { score += 10; reasons.push('warehouse_experience'); }
  if (c.equipment.length) { score += 10; reasons.push('equipment'); }
  if (c.last_contact_at && (Date.parse(today) - Date.parse(c.last_contact_at)) / 864e5 <= 7) { score += 15; reasons.push('recent_contact'); }
  return { score: Math.min(100, score), reasons };
}

// ---------- messages ----------
export function fillTemplate(body: string, vars: Record<string, string | undefined>): string {
  return body.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ? vars[k]! : m));
}
export const smsLink = (phone: string, text: string) => `sms:+1${phone}?&body=${encodeURIComponent(text)}`;
export const waLink = (phone: string, text: string) => `https://wa.me/1${phone}?text=${encodeURIComponent(text)}`;
export const mailLink = (email: string, subject: string, text: string) =>
  `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
export const telLink = (phone: string) => `tel:+1${phone}`;
export const formatPhone = (p: string | null) => (p && p.length === 10 ? `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}` : p ?? '');
export const candidateName = (c: { first_name: string; last_name: string }) => `${c.first_name} ${c.last_name}`;
export const applyUrl = (token: string) => `${window.location.origin}/apply/${token}`;

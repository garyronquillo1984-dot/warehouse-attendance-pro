// Idukay — AUTHORIZED API adapter (placeholder).
//
// There is no authorized Idukay integration today. This adapter therefore reports
// 'not_configured' and the app keeps working with homework entered by the administrator.
// When Idukay (or the school) grants API access, implement fetchHomework() against the
// documented API using these secrets (server-side only):
//   IDUKAY_API_URL     base URL given by Idukay
//   IDUKAY_API_TOKEN   credential issued to this integration (never a parent's password)
//   IDUKAY_CLASS_MAP   JSON: our class id → Idukay's course/section id, e.g. {"<uuid>": "4EGB-A"}
// Map each assignment to SourceHomework, keeping the original text and language untouched.
import type { ClassRef, FetchResult, HomeworkSource } from './source.ts';

export function idukayApiSource(get: (k: string) => string | undefined): HomeworkSource {
  return {
    id: 'idukay_api',
    async fetchHomework(cls: ClassRef): Promise<FetchResult> {
      const url = get('IDUKAY_API_URL'), token = get('IDUKAY_API_TOKEN');
      if (!url || !token) {
        return { status: 'not_configured', message: 'No authorized Idukay integration is configured (IDUKAY_API_URL / IDUKAY_API_TOKEN).' };
      }
      let map: Record<string, string> = {};
      try { map = JSON.parse(get('IDUKAY_CLASS_MAP') || '{}'); } catch { /* reported below */ }
      if (!map[cls.id]) return { status: 'not_configured', message: `Class ${cls.grade_label} ${cls.parallel} is not mapped in IDUKAY_CLASS_MAP.` };
      // Deliberately not implemented: the API contract must come from Idukay's documentation.
      return { status: 'not_configured', message: 'Idukay credentials are present but the adapter is waiting for the authorized API specification.' };
    },
  };
}

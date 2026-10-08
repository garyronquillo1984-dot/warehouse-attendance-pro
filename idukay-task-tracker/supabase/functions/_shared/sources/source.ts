// Where homework comes from. Each source turns its data into SourceHomework rows; the database
// upserts them by external_id (no duplicates, changes versioned).
//
// Rules for every source:
//   * only AUTHORIZED access (an official API or export the school/platform granted);
//   * never a parent's username or password, never scraping;
//   * return 'not_configured' honestly when the authorization/credentials are not there.

export interface ClassRef { id: string; grade_label: string; parallel: string; school_year: string | null }

export interface SourceHomework {
  external_id: string;             // the source's own id (required: it is how duplicates are avoided)
  subject: string;
  title: string;
  instructions?: string | null;    // original text, never translated
  parent_explanation?: string | null;
  language?: 'en' | 'es' | 'other' | null;   // when omitted, the subject's language is used
  start_date: string;              // YYYY-MM-DD
  due_date: string;
  teacher?: string | null;
  attachments?: Array<{ name: string; url?: string }>;
}

export type FetchResult =
  | { status: 'ok'; items: SourceHomework[] }
  | { status: 'not_configured'; message: string };

export interface HomeworkSource {
  id: string;                      // e.g. 'idukay_api'
  fetchHomework(cls: ClassRef): Promise<FetchResult>;
}

export interface Db {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

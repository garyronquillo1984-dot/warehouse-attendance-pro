export const WEEKDAYS = [
  { n: 1, short: 'Mon' }, { n: 2, short: 'Tue' }, { n: 3, short: 'Wed' }, { n: 4, short: 'Thu' },
  { n: 5, short: 'Fri' }, { n: 6, short: 'Sat' }, { n: 7, short: 'Sun' },
];

const toMinutes = (t: string) => { const [h, m] = t.slice(0, 5).split(':').map(Number); return h * 60 + m; };

export function formatTime(t: string): string {
  const [h, m] = t.slice(0, 5).split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function shiftLength(start: string, end: string): { label: string; overnight: boolean } {
  let mins = toMinutes(end) - toMinutes(start);
  const overnight = mins <= 0;
  if (overnight) mins += 24 * 60;
  const h = Math.floor(mins / 60), m = mins % 60;
  return { label: m ? `${h} h ${m} min` : `${h} h`, overnight };
}

export function browserTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'; } catch { return 'America/New_York'; }
}

const US_ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles',
  'America/Anchorage', 'Pacific/Honolulu', 'America/Puerto_Rico'];

export function timezoneOptions(current: string): string[] {
  let all: string[] = [];
  try { all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []; } catch { /* old browser */ }
  const rest = all.filter(z => !US_ZONES.includes(z));
  const list = [...US_ZONES, ...rest];
  return list.includes(current) ? list : [current, ...list];
}

// Date helpers. Every "day" is computed in the app time zone (Ecuador by default),
// not in the server's time zone, so "hoy" matches what the family sees.
import { config } from './config.js';

const MONTHS = {
  ene: 1, enero: 1, jan: 1, january: 1,
  feb: 2, febrero: 2, february: 2,
  mar: 3, marzo: 3, march: 3,
  abr: 4, abril: 4, apr: 4, april: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6, june: 6,
  jul: 7, julio: 7, july: 7,
  ago: 8, agosto: 8, aug: 8, august: 8,
  sep: 9, sept: 9, set: 9, septiembre: 9, setiembre: 9, september: 9,
  oct: 10, octubre: 10, october: 10,
  nov: 11, noviembre: 11, november: 11,
  dic: 12, diciembre: 12, dec: 12, december: 12,
};

const pad = (n) => String(n).padStart(2, '0');

function ymd(y, m, d) {
  if (!(y > 1990 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Today's date (YYYY-MM-DD) in the app time zone. */
export function todayISO(now = new Date()) {
  return isoInZone(now);
}

export function isoInZone(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
  return parts; // en-CA formats as YYYY-MM-DD
}

export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(aISO, bISO) {
  if (!aISO || !bISO) return null;
  const a = Date.UTC(...aISO.split('-').map((v, i) => Number(v) - (i === 1 ? 1 : 0)));
  const b = Date.UTC(...bISO.split('-').map((v, i) => Number(v) - (i === 1 ? 1 : 0)));
  return Math.round((b - a) / 86400000);
}

/**
 * Parse the many date shapes Idukay (or its API) can produce.
 * Returns { date: 'YYYY-MM-DD', time: 'HH:MM' | null } or null.
 *   "oct. 12, 2026 · 23:59", "12 de octubre de 2026", "jueves 8 oct. 2026",
 *   "12/10/2026", "2026-10-12T23:59:00-05:00", epoch millis, Date objects.
 */
export function parseDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return fromDate(value);
  if (typeof value === 'number') {
    if (value > 1e11 && value < 1e14) return fromDate(new Date(value));
    if (value > 1e9 && value < 1e10) return fromDate(new Date(value * 1000));
    return null;
  }
  if (typeof value === 'object') {
    if (value.$date) return parseDate(value.$date);
    return null;
  }
  const s = String(value).trim();
  if (!s) return null;

  // ISO date or date-time
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?/);
  if (m) {
    if (m[4] && m[6]) return fromDate(new Date(s)); // has an explicit zone → convert to app zone
    const date = ymd(+m[1], +m[2], +m[3]);
    return date ? { date, time: m[4] ? `${m[4]}:${m[5]}` : null } : null;
  }

  // ISO date embedded in text: "Entrega: 2026-10-08"
  m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) {
    const date = ymd(+m[1], +m[2], +m[3]);
    if (date) return { date, time: extractTime(s.slice(m.index + 10)) };
  }

  const time = extractTime(s);
  const lower = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // dd/mm/yyyy or dd-mm-yyyy (Latin American order)
  m = lower.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/);
  if (m) {
    const date = ymd(+m[3], +m[2], +m[1]);
    if (date) return { date, time };
  }

  // "oct. 12, 2026"  /  "october 12, 2026"
  m = lower.match(/\b([a-z]{3,10})\.?\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (m && MONTHS[m[1]]) {
    const date = ymd(+m[3], MONTHS[m[1]], +m[2]);
    if (date) return { date, time };
  }

  // "12 de octubre de 2026" / "8 oct. 2026" / "8 oct 2026"
  m = lower.match(/\b(\d{1,2})\s+(?:de\s+)?([a-z]{3,10})\.?,?\s+(?:de(?:l)?\s+)?(\d{4})\b/);
  if (m && MONTHS[m[2]]) {
    const date = ymd(+m[3], MONTHS[m[2]], +m[1]);
    if (date) return { date, time };
  }

  // Without year: "12 de octubre", "oct. 12" → assume the nearest year.
  m = lower.match(/\b(\d{1,2})\s+(?:de\s+)?([a-z]{3,10})\b/) || null;
  let day, month;
  if (m && MONTHS[m[2]]) { day = +m[1]; month = MONTHS[m[2]]; }
  else {
    const m2 = lower.match(/\b([a-z]{3,10})\.?\s+(\d{1,2})\b/);
    if (m2 && MONTHS[m2[1]]) { day = +m2[2]; month = MONTHS[m2[1]]; }
  }
  if (day && month) {
    const today = todayISO();
    const y = Number(today.slice(0, 4));
    // pick the year that puts the date closest to today
    const candidates = [y - 1, y, y + 1].map((yy) => ymd(yy, month, day)).filter(Boolean);
    candidates.sort((a, b) => Math.abs(daysBetween(today, a)) - Math.abs(daysBetween(today, b)));
    if (candidates[0]) return { date: candidates[0], time };
  }
  return null;
}

function extractTime(s) {
  const m = s.match(/\b([01]?\d|2[0-3]):([0-5]\d)\s*(a\.?\s?m\.?|p\.?\s?m\.?)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const ampm = m[3] ? m[3].toLowerCase().replace(/[\s.]/g, '') : '';
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  return `${pad(h)}:${m[2]}`;
}

function fromDate(d) {
  if (isNaN(d)) return null;
  const date = isoInZone(d);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: config.timezone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
  return { date, time };
}

/** Next run time of a top-of-the-hour schedule. */
export function nextTopOfHour(now = new Date()) {
  const d = new Date(now);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(d.getUTCHours() + 1);
  return d;
}

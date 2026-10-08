// Logger that scrubs secrets before anything reaches the console or the database.
import { config, secretValues } from './config.js';

const SENSITIVE_PATTERNS = [
  // key=value / "key": "value" pairs for tokens, cookies, passwords…
  /((?:pass(?:word)?|contrase(?:ñ|n)a|token|jwt|bearer|cookie|session(?:id)?|auth(?:orization)?|secret|api[_-]?key)["']?\s*[:=]\s*["']?)[^\s"',;&}]+/gi,
  /(Bearer\s+)[A-Za-z0-9._~+/=-]+/g,
  // JWT-looking blobs
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
];

export function redact(input) {
  let s = typeof input === 'string' ? input : input instanceof Error ? input.message : JSON.stringify(input);
  if (s == null) return '';
  for (const secret of secretValues()) {
    for (const variant of new Set([secret, encodeURIComponent(secret)])) {
      s = s.split(variant).join('[oculto]');
    }
  }
  for (const re of SENSITIVE_PATTERNS) {
    s = s.replace(re, (m, prefix) => (typeof prefix === 'string' && prefix && !/^eyJ/.test(m) ? prefix + '[oculto]' : '[oculto]'));
  }
  // Never print query strings: they can carry tokens.
  s = s.replace(/(https?:\/\/[^\s?#"']+)\?[^\s#"']*/g, '$1?[…]');
  return s;
}

const sinks = new Set();
export function addLogSink(fn) { sinks.add(fn); return () => sinks.delete(fn); }

function stamp(d = new Date()) {
  return new Intl.DateTimeFormat('es-EC', {
    timeZone: config.timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(d);
}

function write(level, msg) {
  const clean = redact(msg);
  const line = `[${stamp()}] ${level === 'info' ? '' : level.toUpperCase() + ' '}${clean}`;
  (level === 'error' ? console.error : console.log)(line);
  for (const s of sinks) {
    try { s(level, clean); } catch { /* a broken sink must not break logging */ }
  }
}

export const log = {
  info: (m) => write('info', m),
  warn: (m) => write('warn', m),
  error: (m) => write('error', m),
};

// Saves the Idukay browser session (cookies/localStorage) so the hourly sync does not
// have to log in every time. The file is written with 0600 permissions and, when
// SESSION_ENCRYPTION_KEY is set, encrypted with AES-256-GCM. It is never logged.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

const FILE = path.join(config.dataDir, 'idukay-session.bin');

function key() {
  if (!config.sessionEncryptionKey) return null;
  return crypto.createHash('sha256').update(config.sessionEncryptionKey).digest();
}

export function loadSession() {
  try {
    if (!fs.existsSync(FILE)) return undefined;
    const buf = fs.readFileSync(FILE);
    const k = key();
    let json;
    if (buf.subarray(0, 4).toString() === 'ENC1') {
      if (!k) return undefined;
      const iv = buf.subarray(4, 16), tag = buf.subarray(16, 32), data = buf.subarray(32);
      const d = crypto.createDecipheriv('aes-256-gcm', k, iv);
      d.setAuthTag(tag);
      json = Buffer.concat([d.update(data), d.final()]).toString('utf8');
    } else {
      json = buf.toString('utf8');
    }
    return JSON.parse(json);
  } catch {
    return undefined; // corrupt or key changed → just log in again
  }
}

export function saveSession(state) {
  const json = Buffer.from(JSON.stringify(state), 'utf8');
  const k = key();
  let out = json;
  if (k) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', k, iv);
    const data = Buffer.concat([c.update(json), c.final()]);
    // layout: 'ENC1'(4) + iv(12) + tag(16) + data — must match loadSession()
    out = Buffer.concat([Buffer.from('ENC1'), iv, c.getAuthTag(), data]);
  }
  fs.writeFileSync(FILE, out, { mode: 0o600 });
}

export function clearSession() {
  try { fs.unlinkSync(FILE); } catch { /* nothing saved */ }
}

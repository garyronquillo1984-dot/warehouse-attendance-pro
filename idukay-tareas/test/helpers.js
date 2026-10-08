// Sets a throwaway environment BEFORE the app modules are imported.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idukay-test-'));
process.env.DATA_DIR = dir;
process.env.IDUKAY_USERNAME = 'padre@example.com';
process.env.IDUKAY_PASSWORD = 'clave-correcta';
process.env.TZ_APP = 'America/Guayaquil';
process.env.IDUKAY_TIMEOUT_MS = '8000';
process.env.SYNC_ON_START = 'false';
export const dataDir = dir;

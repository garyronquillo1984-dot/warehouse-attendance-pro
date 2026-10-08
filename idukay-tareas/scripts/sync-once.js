// Runs one synchronization and exits. Useful for an external scheduler that runs
// a command (e.g. a cron job on a server) instead of calling the HTTP endpoint.
import { openDb } from '../src/db.js';
import { runSync } from '../src/sync.js';

openDb();
const r = await runSync(process.argv[2] || 'external');
process.exitCode = r.status === 'error' ? 1 : 0;

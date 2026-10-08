// Runs every unit test file: node --experimental-strip-types tests/unit/run.mts
import { report } from './harness.mts';
await import('./payments.test.mts');
await import('./parser.test.mts');
process.exit((await report()) ? 0 : 1);

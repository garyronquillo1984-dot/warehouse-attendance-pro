// Tiny test harness (no dependencies): test(name, fn), then report().
const results: Array<{ name: string; error?: unknown }> = [];
const pending: Array<Promise<void>> = [];

export function test(name: string, fn: () => unknown | Promise<unknown>) {
  pending.push((async () => {
    try { await fn(); results.push({ name }); }
    catch (error) { results.push({ name, error }); }
  })());
}

export function eq(actual: unknown, expected: unknown, label = '') {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label ? label + ': ' : ''}expected ${e}\n      got      ${a}`);
}
export function truthy(v: unknown, label = 'expected truthy') { if (!v) throw new Error(label); }

export async function report() {
  await Promise.all(pending);
  const failed = results.filter(r => r.error);
  for (const r of failed) console.log(`  ✗ ${r.name}\n      ${(r.error as Error)?.message ?? r.error}`);
  console.log(`${results.length - failed.length} passed, ${failed.length} failed`);
  return failed.length === 0;
}

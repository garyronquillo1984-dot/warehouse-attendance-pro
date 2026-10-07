// Checks the Hotmart payload reader against payloads shaped like Hotmart's 2.0.0 examples.
// Run: node --experimental-strip-types tests/webhook/parse.test.mts
import { parseHotmart, planFor, toIso } from '../../supabase/functions/hotmart-webhook/parse.ts';

let passed = 0; const fails: string[] = [];
const ok = (name: string, c: boolean, d = '') => { if (c) passed++; else fails.push(`${name} ${d}`); };
const T = 1767272400000; // 2026-01-01T13:00:00Z

const purchase = {
  id: 'evt-1', creation_date: T, event: 'PURCHASE_APPROVED', version: '2.0.0',
  data: {
    product: { id: 1000001, name: 'Warehouse Attendance Pro' },
    buyer: { email: ' Owner@Example.com ', name: 'Owner', document: '00000000000', checkout_phone: '999', address: { city: 'X' } },
    purchase: { transaction: 'HP0000000001', status: 'APPROVED', approved_date: T - 60000, date_next_charge: T + 30 * 864e5,
                offer: { code: 'abc123' }, recurrence_number: 1, price: { value: 49, currency_value: 'USD' } },
    subscription: { status: 'ACTIVE', plan: { id: 2000001, name: 'Monthly' }, subscriber: { code: 'SUB00001' } },
  },
};
const p = parseHotmart(purchase)!;
ok('purchase: ids', p.eventId === 'evt-1' && p.eventType === 'PURCHASE_APPROVED' && p.transaction === 'HP0000000001');
ok('purchase: subscriber code', p.subscriberCode === 'SUB00001');
ok('purchase: email normalised', p.buyerEmail === 'owner@example.com', String(p.buyerEmail));
ok('purchase: event time from ms', p.eventTime === '2026-01-01T13:00:00.000Z', String(p.eventTime));
ok('purchase: period end = next charge', p.periodEnd === new Date(T + 30 * 864e5).toISOString());
ok('purchase: product id', p.productId === '1000001');
ok('purchase: offer code first among plan keys', p.planKeys[0] === 'abc123');
const kept = JSON.stringify(p.payload);
ok('purchase: buyer document, phone and address are not kept', !kept.includes('00000000000') && !kept.includes('checkout_phone') && !kept.includes('city'), kept);

const cancel = parseHotmart({ id: 'evt-2', creation_date: T, event: 'SUBSCRIPTION_CANCELLATION', version: '2.0.0',
  data: { date_next_charge: T + 10 * 864e5, cancellation_date: T - 1000, product: { id: 1000001 },
          subscriber: { code: 'SUB00001', email: 'owner@example.com', phone: { cell: '9' } },
          subscription: { id: 3000001, plan: { id: 2000001, name: 'Monthly' } } } })!;
ok('cancellation: subscriber from data.subscriber', cancel.subscriberCode === 'SUB00001' && cancel.buyerEmail === 'owner@example.com');
ok('cancellation: period end', cancel.periodEnd === new Date(T + 10 * 864e5).toISOString());
ok('cancellation: phone not kept', !JSON.stringify(cancel.payload).includes('"cell"'));

const sw = parseHotmart({ id: 'evt-3', creation_date: T, event: 'SWITCH_PLAN', version: '2.0.0',
  data: { switch_plan_date: T - 1000,
          subscription: { subscriber_code: 'SUB00003', status: 'ACTIVE', date_next_charge: T + 30 * 864e5,
                          product: { id: 1000001 }, user: { email: 'c@example.com' } },
          plans: [{ id: 2000002, name: 'Annual', offer: { key: 'plan0002' }, current: true },
                  { id: 2000001, name: 'Monthly', offer: { key: 'plan0001' }, current: false }] } })!;
ok('switch plan: subscriber code and email', sw.subscriberCode === 'SUB00003' && sw.buyerEmail === 'c@example.com');
ok('switch plan: current plan first', sw.planKeys[0] === 'plan0002' && !sw.planKeys.includes('plan0001'), sw.planKeys.join());
ok('switch plan: product id from subscription', sw.productId === '1000001');

const upd = parseHotmart({ id: 'evt-4', creation_date: T, event: 'UPDATE_SUBSCRIPTION_CHARGE_DATE', version: '2.0.0',
  data: { subscriber: { code: 'SUB00004', email: 'b@example.com' },
          subscription: { product: { id: 1000001 }, old_charge_day: 5, new_charge_day: 15, date_next_charge: '2026-01-15T12:00:00.000Z', status: 'ACTIVE' },
          plan: { id: 2000001, name: 'Monthly', offer: { code: 'plan0001' } } } })!;
ok('charge date: ISO date read', upd.periodEnd === '2026-01-15T12:00:00.000Z' && upd.subscriberCode === 'SUB00004');

ok('seconds are read as seconds', toIso(1767272400) === '2026-01-01T13:00:00.000Z');
ok('numeric strings are read', toIso(String(T)) === '2026-01-01T13:00:00.000Z');
ok('garbage date → null', toIso('not a date') === null);
ok('not an event → null', parseHotmart({ hello: 1 }) === null && parseHotmart('x') === null);
ok('plan map: mapped offer', planFor(['abc123', 'Monthly'], { Monthly: 'starter', abc123: 'business' }, 'professional') === 'business');
ok('plan map: fallback', planFor(['zzz'], {}, 'professional') === 'professional');

console.log(`${passed} passed, ${fails.length} failed`);
for (const f of fails) console.log(' ✗ ' + f);
process.exit(fails.length ? 1 : 0);

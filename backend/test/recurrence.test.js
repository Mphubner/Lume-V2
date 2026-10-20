import test from 'node:test';
import assert from 'node:assert/strict';
import { occurrencesBetween, projectCashFlow } from '../src/domain/recurrence.js';

const bill = { id: 'bill-a', workspace_id: 'ws-a', name: 'Aluguel', status: 'active', amount: 100, type: 'expense', recurrence: 'monthly', start_date: '2024-01-31', due_day: 31, adjust_to_business_day: false };
const dates = (b, start, end) => occurrencesBetween(b, start, end).map(item => item.due_date);

test('month-end anchors clamp February and recover the original day in March', () => {
  assert.deepEqual(dates(bill, '2024-01-01', '2024-03-31'), ['2024-01-31', '2024-02-29', '2024-03-31']);
  assert.deepEqual(dates(bill, '2025-01-01', '2025-03-31'), ['2025-01-31', '2025-02-28', '2025-03-31']);
});
test('weekly and biweekly schedules preserve their real start-date anchor', () => {
  const weekly = { ...bill, start_date: '2026-01-30', recurrence: 'weekly' };
  assert.deepEqual(dates(weekly, '2026-02-01', '2026-02-28'), ['2026-02-06', '2026-02-13', '2026-02-20', '2026-02-27']);
  assert.deepEqual(dates({ ...weekly, recurrence: 'biweekly' }, '2026-02-01', '2026-03-01'), ['2026-02-13', '2026-02-27']);
});
test('quarterly and yearly cycles do not become monthly recurrences', () => {
  assert.deepEqual(dates({ ...bill, recurrence: 'quarterly' }, '2024-01-01', '2024-12-31'), ['2024-01-31', '2024-04-30', '2024-07-31', '2024-10-31']);
  assert.deepEqual(dates({ ...bill, recurrence: 'yearly', start_date: '2024-02-29', due_day: 29 }, '2024-01-01', '2026-12-31'), ['2024-02-29', '2025-02-28', '2026-02-28']);
});
test('weekend adjustment can cross month boundary without losing the occurrence', () => {
  const result = occurrencesBetween({ ...bill, start_date: '2026-01-31', adjust_to_business_day: true }, '2026-02-01', '2026-02-28');
  assert.equal(result.length, 1); assert.equal(result[0].scheduled_date, '2026-01-31'); assert.equal(result[0].due_date, '2026-02-02');
  assert.ok(result[0].assumptions[0].includes('feriados'));
});
test('unknown legacy start dates are not invented; negative amounts fail closed', () => {
  assert.deepEqual(occurrencesBetween({ ...bill, start_date: null }, '2026-01-01', '2026-03-31'), []);
  assert.deepEqual(occurrencesBetween({ ...bill, status: 'inactive' }, '2026-01-01', '2026-03-31'), []);
  assert.throws(() => occurrencesBetween({ ...bill, amount: -100 }, '2026-01-01', '2026-03-31'), RangeError);
});
function settlement(overrides = {}, txOverrides = {}) {
  return { id: 'settlement-a', workspace_id: 'ws-a', recurring_id: 'bill-a', due_date: '2026-01-31', paid_at: '2026-01-30T18:00:00Z', confirmed_by: 'user-a', transaction_id: 'tx-a',
    transactions: { id: 'tx-a', workspace_id: 'ws-a', amount: -100, type: 'expense', economic_kind: 'standard', date: '2026-01-30', ledger_status: 'posted', is_reconciled: true, legacy_needs_review: false, ...txOverrides }, ...overrides };
}
test('settlement requires a matching posted, reviewed transaction in the same workspace', () => {
  const invoke = s => occurrencesBetween(bill, '2026-01-01', '2026-01-31', [s], { asOf: '2026-02-01' })[0];
  assert.equal(invoke(settlement()).status, 'paid'); assert.equal(invoke(settlement()).paid_on, '2026-01-30');
  for (const tx of [{ ledger_status: 'voided' }, { is_reconciled: false }, { legacy_needs_review: true }, { amount: -99 }, { type: 'income' }, { workspace_id: 'foreign' }, { economic_kind: 'card_payment' }, { date: '2026-02-02' }]) {
    assert.equal(invoke(settlement({}, tx)).status, 'overdue');
  }
  for (const s of [{ workspace_id: 'foreign' }, { confirmed_by: null }, { paid_at: '2026-02-03T00:00:00Z' }]) assert.equal(invoke(settlement(s)).status, 'overdue');
});
test('projection uses signed unpaid events in cents and keeps unknown opening balances unknown', () => {
  const events = [{ id: 'paid', due_date: '2026-02-01', type: 'expense', amount: 900, status: 'paid' },
    { id: 'income', due_date: '2026-02-01', type: 'income', amount: 0.2, status: 'pending' },
    { id: 'expense', due_date: '2026-02-02', type: 'expense', amount: 0.1, status: 'pending' }];
  const projection = projectCashFlow(0.1, events, '2026-02-01', 2);
  assert.equal(projection[0].projectedBalance, 0.3); assert.equal(projection[1].projectedBalance, 0.2);
  assert.deepEqual(projection[0].occurrenceIds, ['income']);
  assert.equal(projectCashFlow(null, events, '2026-02-01', 1)[0].projectedBalance, null);
});

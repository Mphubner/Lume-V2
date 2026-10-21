import { validDate, toCents, fromCents } from './money.js';
import { addDays, dateOnly, monthEnd } from './financial.js';

function businessDay(date) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 6 ? addDays(date, 2) : day === 0 ? addDays(date, 1) : date;
}

// Calendar dates are UTC date-only values; no local midnight/DST arithmetic.
// Weekly/biweekly anchor to start_date. Longer cycles retain the original month
// and due_day, clamping to the month's last day without drifting subsequent cycles.
export function occurrencesBetween(bill, startDate, endDate, settlements = [], { asOf = endDate } = {}) {
  if (!validDate(startDate) || !validDate(endDate) || !validDate(asOf) || startDate > endDate) throw new RangeError('Intervalo de recorrência inválido.');
  if (bill.status !== 'active') return [];
  if (!validDate(bill.start_date)) return [];
  if (!['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'].includes(bill.recurrence)) throw new RangeError('Recorrência inválida.');
  const amount = toCents(bill.amount);
  if (amount <= 0) throw new RangeError('Recorrência sem valor positivo.');
  const result = [];
  const dayInterval = bill.recurrence === 'weekly' ? 7 : bill.recurrence === 'biweekly' ? 14 : null;
  const monthInterval = { monthly: 1, quarterly: 3, yearly: 12 }[bill.recurrence];
  const anchor = new Date(`${bill.start_date}T12:00:00Z`);
  const lower = new Date(`${addDays(startDate, -3)}T12:00:00Z`);
  let index = dayInterval ? Math.max(0, Math.floor((lower - anchor) / 86400000 / dayInterval))
    : Math.max(0, Math.floor(((lower.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + lower.getUTCMonth() - anchor.getUTCMonth()) / monthInterval));
  const dueDay = Number(bill.due_day);
  if (!dayInterval && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)) throw new RangeError('Dia de vencimento inválido.');
  for (let count = 0; count < 5000; count++, index++) {
    let scheduledDate;
    if (dayInterval) scheduledDate = addDays(bill.start_date, dayInterval * index);
    else {
      const month = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + index * monthInterval, 1, 12));
      const lastDay = Number(monthEnd(month.getUTCFullYear(), month.getUTCMonth() + 1).slice(-2));
      month.setUTCDate(Math.min(dueDay, lastDay));
      scheduledDate = dateOnly(month);
    }
    if (scheduledDate > endDate) break;
    if (scheduledDate < bill.start_date) continue;
    const dueDate = bill.adjust_to_business_day ? businessDay(scheduledDate) : scheduledDate;
    if (dueDate < startDate || dueDate > endDate) continue;
    const settlement = settlements.find(item => item.recurring_id === bill.id && item.workspace_id === bill.workspace_id && item.due_date === dueDate);
    const tx = settlement?.transactions;
    const settled = Boolean(settlement?.paid_at && settlement.paid_at.slice(0, 10) <= asOf && settlement.confirmed_by
      && tx && tx.ledger_status === 'posted' && tx.is_reconciled === true && tx.legacy_needs_review !== true && tx.workspace_id === bill.workspace_id
      && tx.date <= asOf && tx.economic_kind === 'standard' && tx.type === (bill.type || 'expense')
      && toCents(tx.amount) === (bill.type === 'income' ? amount : -amount));
    result.push({ id: settlement?.id ?? `${bill.id}:${dueDate}`, recurring_id: bill.id, workspace_id: bill.workspace_id,
      name: bill.name, amount: fromCents(amount), type: bill.type || 'expense', recurrence: bill.recurrence,
      scheduled_date: scheduledDate, due_date: dueDate, paid_at: settled ? settlement.paid_at : null, paid_on: settled ? tx.date : null,
      status: settled ? 'paid' : dueDate < asOf ? 'overdue' : 'pending', transaction_id: settled ? settlement.transaction_id : null,
      adjusted: dueDate !== scheduledDate, assumptions: bill.adjust_to_business_day ? ['Ajuste de fim de semana; feriados não cadastrados.'] : [] });
    if (count === 4999) throw new RangeError('Período de recorrências muito amplo.');
  }
  return result;
}

export function projectCashFlow(initialBalance, occurrences, startDate, days = 30) {
  if (!Number.isInteger(days) || days < 1 || days > 366) throw new RangeError('Horizonte de projeção inválido.');
  let running = initialBalance === null ? null : toCents(initialBalance);
  return Array.from({ length: days }, (_, index) => {
    const date = addDays(startDate, index);
    const pending = occurrences.filter(item => item.due_date === date && item.status !== 'paid');
    const income = pending.filter(item => item.type === 'income').reduce((sum, item) => sum + toCents(item.amount), 0);
    const expense = pending.filter(item => item.type !== 'income').reduce((sum, item) => sum + toCents(item.amount), 0);
    if (running !== null) running += income - expense;
    return { date, expectedIncome: fromCents(income), expectedExpense: fromCents(expense),
      projectedBalance: running === null ? null : fromCents(running), occurrenceIds: pending.map(item => item.id),
      basis: 'registered_unpaid_recurrences', estimated: true };
  });
}

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { checked, resolveScope, scopeQuery, fetchAll, HTTPError } from './access.js';
import { toCents, fromCents, today } from '../domain/money.js';
import { FACTS_VERSION, resolvePeriod, coverageWarnings, monetaryTotal, addDays } from '../domain/financial.js';
import { occurrencesBetween, projectCashFlow } from '../domain/recurrence.js';

const cash = z.union([z.string(), z.number().finite()]).transform(value => fromCents(toCents(value)));
const count = z.number().int().nonnegative();
const rawSchema = z.object({
  factsVersion: z.literal(FACTS_VERSION), dataVersion: z.string().min(1),
  stats: z.object({ income: cash, expenses: cash, periodBalance: cash, balance: cash.nullable(), cashBalance: cash.nullable(),
    cashFlowNet: cash, transfers: cash, transferInflows: cash, transferOutflows: cash, excludedPrincipal: cash, savingsRate: z.number().finite().nullable() }),
  accounts: z.array(z.object({ id: z.string(), workspace_id: z.string(), name: z.string(), type: z.string(),
    opening: cash, current: cash.nullable(), movement: cash, known: z.boolean(), balance_date: z.string().nullable(),
    pendingTransactions: count, legacyTransactions: count }).passthrough()),
  byCategory: z.array(z.object({ id: z.string().nullable(), name: z.string(), total: cash, count }).passthrough()),
  byWorkspaceCategory: z.array(z.object({ workspace_id: z.string(), category_id: z.string().nullable(), total: cash })).default([]),
  monthlyEvolution: z.array(z.object({ month: z.string(), income: cash, expenses: cash, balance: cash, transactions: count, verified: z.boolean() })),
  coverage: z.object({ accountCount: count, unknownBalanceAccounts: count, postedTransactions: count, pendingTransactions: count,
    legacyTransactions: count, unresolvedTransfers: count, boundaryTransfers: count, invalidRefunds: count, invalidTransactions: count,
    observedMonthCount: count, requestedMonthCount: count, verifiedMonthCount: count, verifiedMonths: z.array(z.string()),
    firstDate: z.string().nullable(), lastDate: z.string().nullable(), complete: z.boolean() }),
});
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export function fingerprint(value) { return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }
function snapshotFacts(snapshot) {
  const source = { kind: 'financial_snapshot', version: FACTS_VERSION, dataVersion: snapshot.dataVersion,
    workspaceIds: snapshot.scope.ids, startDate: snapshot.period.startDate, endDate: snapshot.period.endDate,
    asOf: snapshot.period.asOf, filters: { ledger_status: 'posted', is_reconciled: true, legacy_needs_review: false } };
  const fact = (id, label, value, unit = 'BRL', extra = {}) => ({ id, label, value, unit, source: { ...source, ...extra } });
  return [fact('period.income', 'Receitas reconhecidas no período', snapshot.stats.income),
    fact('period.expenses', 'Despesas líquidas de estornos vinculados', snapshot.stats.expenses),
    fact('period.net', 'Resultado econômico do período', snapshot.stats.periodBalance),
    fact('accounts.balance', 'Saldo das contas cadastradas na data de referência', snapshot.stats.balance),
    fact('accounts.cash', 'Saldo em contas de caixa cadastradas', snapshot.stats.cashBalance),
    fact('period.transfers', 'Saídas de transferências internas confirmadas', snapshot.stats.transfers),
    fact('coverage.pending', 'Movimentos aguardando revisão', snapshot.coverage.pendingTransactions, 'count'),
    fact('coverage.observedMonths', 'Meses com movimentos observados', snapshot.coverage.observedMonthCount, 'count'),
    fact('coverage.verifiedMonths', 'Meses com fechamento conciliado', snapshot.coverage.verifiedMonthCount, 'count'),
    ...snapshot.byCategory.map(category => fact(`category.${category.id ?? 'uncategorized'}.expenses`, `Despesas: ${category.name}`, category.total, 'BRL', { categoryId: category.id })),
    ...snapshot.accounts.map(account => fact(`account.${account.id}.balance`, `Saldo: ${account.name}`, account.current, 'BRL', { accountId: account.id, balanceDate: account.balance_date })),
  ];
}
export async function getFinancialSnapshot(db, userId, query = {}, options = {}) {
  const scope = options.scope ?? await resolveScope(db, userId, query.workspace ?? query.workspace_id);
  const period = resolvePeriod(query, options);
  period.asOf = period.endDate;
  const raw = checked(await db.rpc('financial_snapshot', { p_user_id: userId, p_workspace_ids: scope.ids,
    p_start_date: period.startDate, p_end_date: period.endDate, p_as_of: period.asOf }));
  const parsed = rawSchema.safeParse(raw);
  if (!parsed.success) throw new HTTPError(502, 'Retrato financeiro inválido. Verifique as migrações e a integridade dos dados.');
  const snapshot = { ...parsed.data, scope, period };
  snapshot.coverage.transactionCount = snapshot.coverage.postedTransactions;
  snapshot.quality = { status: snapshot.coverage.complete ? 'verified' : 'partial', warnings: coverageWarnings(snapshot.coverage),
    basis: 'Movimentos contabilizados e revisados; fechamento de saldo por conta e data.', currency: 'BRL' };
  snapshot.fingerprint = fingerprint({ ...snapshot, scope: { ids: [...scope.ids].sort(), userId } });
  snapshot.facts = snapshotFacts(snapshot);
  return snapshot;
}
export async function getFinancialContext(db, userId, query = {}, options = {}) {
  const snapshot = options.snapshot ?? await getFinancialSnapshot(db, userId, query, options);
  const scope = snapshot.scope;
  const projectionStart = addDays(snapshot.period.asOf, 1);
  const occurrenceEnd = addDays(projectionStart, 29);
  const [debts, goals, reserves, recurring, settlements] = await Promise.all([
    fetchAll(() => scopeQuery(db.from('debts').select('id,workspace_id,name,current_balance,original_amount,interest_rate,installment_amount,due_day,status'), scope).order('id')),
    fetchAll(() => scopeQuery(db.from('goals').select('id,workspace_id,name,target_amount,current_amount,deadline,status'), scope).order('id')),
    fetchAll(() => scopeQuery(db.from('emergency_reserve').select('id,workspace_id,current_amount,target_amount,monthly_income,months_target'), scope).order('id')),
    fetchAll(() => scopeQuery(db.from('recurring_bills').select('*'), scope).eq('status', 'active').order('id')),
    fetchAll(() => scopeQuery(db.from('recurring_occurrences').select('id,workspace_id,recurring_id,due_date,paid_at,transaction_id,confirmed_by,transactions!transaction_id(id,workspace_id,amount,type,economic_kind,date,ledger_status,is_reconciled,legacy_needs_review)'), scope)
      .gte('due_date', snapshot.period.startDate).lte('due_date', occurrenceEnd).order('id')),
  ]);
  const occurrences = recurring.flatMap(bill => occurrencesBetween(bill, snapshot.period.startDate, occurrenceEnd, settlements, { asOf: snapshot.period.asOf }));
  const incompleteSchedules = recurring.filter(bill => !bill.start_date).map(bill => bill.id);
  const upcomingBills = occurrences.filter(item => item.status !== 'paid' && item.due_date >= projectionStart && item.due_date <= addDays(projectionStart, 13))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const overdueBills = occurrences.filter(item => item.status === 'overdue');
  const totalDebt = monetaryTotal(debts.filter(debt => ['active', 'negotiating'].includes(debt.status)).map(debt => debt.current_balance ?? debt.original_amount));
  const reserve = reserves.length ? { current_amount: monetaryTotal(reserves.map(row => row.current_amount)), target_amount: monetaryTotal(reserves.map(row => row.target_amount)) } : null;
  const goalsProgress = { active: goals.filter(goal => goal.status === 'active').length,
    totalSaved: monetaryTotal(goals.map(goal => goal.current_amount)), totalTarget: monetaryTotal(goals.map(goal => goal.target_amount)) };
  const context = { snapshot, debts, goals, reserves, recurring, occurrences, upcomingBills, overdueBills, incompleteSchedules,
    totalDebt, emergencyReserve: reserve, goalsProgress, cashFlowProjection: projectCashFlow(snapshot.stats.cashBalance, occurrences, projectionStart),
    projectionAssumptions: ['Cenário baseado apenas nas recorrências cadastradas ainda não liquidadas.',
      'O saldo inicial usa contas de caixa; investimentos, limites de cartão e reserva declarada não são somados ao caixa.',
      'Rendas futuras são estimativas. Gastos não recorrentes e feriados não cadastrados não estão previstos.',
      'Ocorrências em atraso são apresentadas separadamente, sem inventar uma data de pagamento.',
      'Dívidas, metas, reserva e regras de recorrência refletem o cadastro atual; não há reconstrução histórica desses cadastros.'],
  };
  const source = table => ({ kind: 'registered_records', table, workspaceIds: scope.ids, recordedAsOf: today(), historicalReconstruction: false });
  context.facts = [...snapshot.facts,
    { id: 'debts.total', label: 'Saldo de dívidas cadastradas', value: totalDebt, unit: 'BRL', source: { ...source('debts'), recordIds: debts.map(row => row.id) } },
    { id: 'reserve.current', label: 'Reserva declarada', value: reserve?.current_amount ?? null, unit: 'BRL', source: { ...source('emergency_reserve'), recordIds: reserves.map(row => row.id) } },
    { id: 'goals.saved', label: 'Valor registrado nas metas', value: goalsProgress.totalSaved, unit: 'BRL', source: { ...source('goals'), recordIds: goals.map(row => row.id) } },
    { id: 'recurring.upcoming', label: 'Ocorrências pendentes nos próximos quatorze dias', value: upcomingBills.length, unit: 'count', source: { ...source('recurring_bills'), occurrenceIds: upcomingBills.map(row => row.id) } },
  ];
  context.fingerprint = fingerprint({ snapshot: snapshot.fingerprint, debts, goals, reserves, recurring, settlements });
  context.generatedAt = new Date().toISOString();
  return context;
}
export function publicContext(context) {
  return { facts: context.facts, factsVersion: FACTS_VERSION, fingerprint: context.fingerprint,
    period: context.snapshot.period, scope: context.snapshot.scope, coverage: context.snapshot.coverage,
    quality: context.snapshot.quality, generatedAt: context.generatedAt, asOf: context.snapshot.period.asOf };
}

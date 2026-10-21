import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { getFinancialContext, getFinancialSnapshot } from '../src/services/financialFacts.js';
import { calculateFinancialPlan } from '../src/domain/planner.js';
import { generateFinancialPlan } from '../src/services/plannerService.js';
import { callAI, getAIReadiness, chatWithAssistant } from '../src/services/aiService.js';
import { createAIRouter } from '../src/routes/ai.js';

const ws = '10000000-0000-4000-8000-000000000002';
const user = '10000000-0000-4000-8000-000000000001';
const scope = { ids: [ws], id: ws, userId: user, kind: 'personal', role: 'owner' };
const period = { start_date: '2026-08-01', end_date: '2026-09-30' };
const noAI = async () => ({ content: null, error: 'disabled' });
function raw(complete = true) {
  return { factsVersion: 'financial-v1', dataVersion: 'revision-1',
    stats: { income: 10000, expenses: 6000, periodBalance: 4000, balance: 1200, cashBalance: 1200, cashFlowNet: 4000, transfers: 0, transferInflows: 0, transferOutflows: 0, excludedPrincipal: 0, savingsRate: 40 },
    accounts: [{ id: 'acc', workspace_id: ws, name: 'Caixa', type: 'checking', opening: -2800, movement: 4000, current: 1200, known: true, balance_date: '2026-07-31', pendingTransactions: 0, legacyTransactions: 0 }],
    byCategory: [], byWorkspaceCategory: [], monthlyEvolution: [],
    coverage: { accountCount: 1, unknownBalanceAccounts: 0, postedTransactions: 10, pendingTransactions: complete ? 0 : 1, legacyTransactions: 0, unresolvedTransfers: 0, boundaryTransfers: 0, invalidRefunds: 0, invalidTransactions: 0, observedMonthCount: 2, requestedMonthCount: 2, verifiedMonthCount: complete ? 2 : 1, verifiedMonths: complete ? ['2026-08','2026-09'] : ['2026-08'], firstDate: '2026-08-01', lastDate: '2026-09-30', complete } };
}
function records() {
  const bill = (id, recurrence, start_date, amount, type = 'expense', due_day = 1) => ({ id, workspace_id: ws, name: id, recurrence, start_date, due_day, amount, status: 'active', type });
  return { debts: [{ id: 'debt-1', workspace_id: ws, name: 'Empréstimo', status: 'active', original_amount: 1000, current_balance: 1000, installment_amount: 200, interest_rate: 2 }],
    goals: [{ id: 'goal-1', workspace_id: ws, name: 'Curso', target_amount: 1200, current_amount: 0, deadline: '2026-12-31', status: 'active' }],
    emergency_reserve: [{ id: 'reserve-1', workspace_id: ws, current_amount: 1000, target_amount: 2000 }],
    recurring_bills: [bill('salary','monthly','2026-10-05',5000,'income',5), bill('rent','monthly','2026-10-10',1000,'expense',10),
      bill('annual','yearly','2026-10-09',1200,'expense',9), bill('weekly','weekly','2026-10-01',100),
      bill('biweekly','biweekly','2026-10-02',200), bill('quarterly','quarterly','2026-10-15',600,'expense',15)], recurring_occurrences: [] };
}
function fixture({ payload = raw(), data = records(), membership = true } = {}) {
  const calls = [], writes = [];
  const db = { calls, writes,
    from(table) {
      const query = { select() { return this; }, in(column, ids) { calls.push({ table, column, ids }); return this; }, eq() { return this; }, gte() { return this; }, lte() { return this; }, order() { return this; },
        async range(start, end) { return { data: (data[table] ?? []).slice(start, end + 1), error: null }; },
        then(resolve, reject) { return Promise.resolve({ data: table === 'workspace_members' && membership ? [{ role: 'owner', workspaces: { id: ws, owner_id: user, name: 'Pessoal', kind: 'personal' } }] : [], error: null }).then(resolve, reject); },
      }; return query;
    },
    async rpc(name, args) { calls.push({ name, args }); if (name !== 'financial_snapshot') writes.push(name); return { data: payload, error: null }; },
  }; return db;
}
async function context(options) {
  const db = fixture(options);
  const snapshot = await getFinancialSnapshot(db, user, period, { scope, asOf: '2026-10-20' });
  return getFinancialContext(db, user, period, { snapshot });
}
async function request(db, body, path = '/plan', ai = noAI) {
  const app = express(); app.use(express.json()); app.use(createAIRouter(db, (req, _res, next) => { req.user = { id: user }; next(); }, { call: ai, env: { AI_ENABLED: 'false' } }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try { const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: response.status, body: await response.json() }; }
  finally { await new Promise(resolve => server.close(resolve)); }
}
test('known monthly scenario allocates exact surplus once and traces every step', async () => {
  const c = await context(); const original = structuredClone(c);
  const plan = await generateFinancialPlan(c, { debtPaymentsInExpenses: 'none' }, { call: noAI });
  assert.equal(plan.status, 'reviewable'); assert.equal(plan.scenario.monthlyIncome, 5000); assert.equal(plan.scenario.monthlyExpenseLimit, 3000);
  assert.equal(plan.scenario.additionalDebtCommitment, 200); assert.equal(plan.scenario.monthlyRemainder, 1800); assert.equal(plan.scenario.allocated, 1800);
  assert.deepEqual(plan.steps.filter(s => s.calculation?.amount > 0).map(s => s.calculation.amount), [800,1000]);
  assert.equal(plan.goals[0].monthlyRequired, 400); assert.equal(plan.reserve.declared, 1000); assert.equal(plan.diagnostic.cashBalance, 1200);
  assert.equal(plan.mode, 'deterministic'); assert.equal(plan.aiStatus, 'disabled'); assert.equal(plan.financialWrites, false);
  for (const step of plan.steps) assert.deepEqual(step.evidence.map(f => f.id), step.factIds);
  assert.deepEqual(c, original);
});
test('partial/pending history and ambiguous debt overlap never create spendable money', async () => {
  const c = await context({ payload: raw(false) });
  const missing = calculateFinancialPlan(c);
  assert.equal(missing.status, 'insufficient_context'); assert.equal(missing.scenario.monthlyRemainder, null); assert.equal(missing.scenario.contributionLimit, null);
  assert.ok(missing.allocations.every(row => row.amount === null)); assert.ok(missing.steps.some(s => s.id === 'coverage'));
  assert.ok(missing.missing.some(item => item.code === 'partial_history')); assert.ok(missing.missing.some(item => item.code === 'debt_overlap'));
  const explicit = calculateFinancialPlan(c, { monthlyIncome: 5000, monthlyExpenseLimit: 3000, debtPaymentsInExpenses: 'all', monthlyContributionLimit: 500, priority: 'goals' });
  assert.equal(explicit.status, 'provisional'); assert.equal(explicit.scenario.monthlyRemainder, 2000); assert.equal(explicit.scenario.allocated, 500);
  assert.equal(explicit.scenario.budgetUnallocated, 1500); assert.equal(explicit.steps.find(s => s.id === 'contribution.goal.goal-1').calculation.amount, 400);
});
test('revisions cap contributions, preserve facts, reject extra financial fields and show deficits', async () => {
  const c = await context();
  const plan = calculateFinancialPlan(c, { monthlyIncome: 100, monthlyExpenseLimit: 500, debtPaymentsInExpenses: 'none', monthlyContributionLimit: 999999 });
  assert.equal(plan.scenario.monthlyRemainder, -600); assert.equal(plan.scenario.allocated, 0); assert.equal(plan.scenario.feasible, false);
  assert.ok(plan.steps.some(step => step.id === 'deficit')); assert.equal(c.snapshot.stats.income, 10000);
  for (const scenario of [{ monthlyIncome: -1 }, { monthlyIncome: '0.001' }, { balance: 999 }, { executePayments: true }, { monthlyExpenseLimit: 'NaN' }]) assert.throws(() => calculateFinancialPlan(c, scenario));
  const one = await generateFinancialPlan(c, { debtPaymentsInExpenses: 'none' }, { call: noAI });
  const two = await generateFinancialPlan(c, { debtPaymentsInExpenses: 'all' }, { call: noAI });
  assert.notEqual(one.planFingerprint, two.planFingerprint); assert.equal(one.fingerprint, two.fingerprint);
});
test('fixed frequencies generate calendar occurrences; reserves do not increase projected cash', async () => {
  const c = await context(); const plan = calculateFinancialPlan(c, { debtPaymentsInExpenses: 'all' });
  assert.equal(plan.commitments.next30DaysIncome, 5000); assert.equal(plan.commitments.next30DaysExpense, 3900);
  assert.equal(plan.commitments.projection.at(-1).date, '2026-10-30'); assert.equal(plan.commitments.projection.at(-1).projectedBalance, 2300);
  assert.equal(plan.commitments.occurrences.filter(o => o.recurring_id === 'weekly').length, 5);
  assert.equal(plan.commitments.occurrences.filter(o => o.recurring_id === 'biweekly').length, 3);
});
test('a monthly surplus cannot hide a cash shortfall before the salary date', async () => {
  const payload = raw(); payload.stats.cashBalance = 0;
  const plan = calculateFinancialPlan(await context({ payload }), { debtPaymentsInExpenses: 'all' });
  assert.equal(plan.scenario.monthlyRemainder, 2000); assert.equal(plan.commitments.firstShortfallDate, '2026-10-01');
  assert.equal(plan.commitments.minimumProjectedBalance, -300); assert.ok(plan.steps.some(step => step.id === 'cash_shortfall' && step.priority === 'first'));
});
test('missing reserve, zero-history, unknown installments and missing recurrence dates stay explicit', async () => {
  const payload = raw(false); payload.coverage.observedMonthCount = 0; payload.stats.cashBalance = null;
  const data = records(); data.debts[0].installment_amount = null; data.emergency_reserve = []; data.recurring_bills[0].start_date = null;
  const plan = calculateFinancialPlan(await context({ payload, data }));
  for (const code of ['no_history','unknown_cash','missing_installments','missing_reserve']) assert.ok(plan.missing.some(item => item.code === code));
  assert.ok(plan.missing.some(item => item.code === 'incomplete_schedules')); assert.equal(plan.reserve.declared, null); assert.equal(plan.scenario.monthlyIncome, null);
});
test('mixed and foreign workspace records are rejected before presenting a plan', async () => {
  const c = await context(); c.debts[0].workspace_id = 'foreign'; assert.throws(() => calculateFinancialPlan(c), /outro espaço/);
  c.debts = []; c.snapshot.scope = { ...scope, id: null, ids: [ws, 'foreign'] }; assert.throws(() => calculateFinancialPlan(c), /espaço específico/);
});
test('invalid, injected, unavailable and timed-out model output leaves computed plan intact', async () => {
  const c = await context(); const scenario = { debtPaymentsInExpenses: 'all' };
  for (const content of ['bad json', '{"highlightedStepIds":["invented"]}', '{"highlightedStepIds":["review","review"]}', '{"highlightedStepIds":["review"],"balance":999999}']) {
    const plan = await generateFinancialPlan(c, scenario, { call: async () => ({ content }) });
    assert.equal(plan.mode, 'deterministic'); assert.equal(plan.aiStatus, 'invalid_response'); assert.equal(plan.scenario.monthlyRemainder, 2000);
  }
  const timeout = await generateFinancialPlan(c, scenario, { env: { AI_ENABLED: 'true', AI_PROVIDER: 'groq', AI_API_KEY: 'fixture' }, timeoutMs: 10, fetchImpl: async () => new Promise(() => {}) });
  assert.equal(timeout.aiStatus, 'timeout'); assert.equal(timeout.scenario.monthlyRemainder, 2000);
  const thrown = await generateFinancialPlan(c, scenario, { call: async () => { throw new Error('secret-test'); } }); assert.equal(thrown.aiStatus, 'provider_unavailable');
  const accepted = await generateFinancialPlan(c, scenario, { call: async () => ({ content: '{"highlightedStepIds":["review"]}' }) });
  assert.equal(accepted.mode, 'assisted_presentation'); assert.equal(accepted.scenario.monthlyRemainder, 2000);
});
test('AI readiness means configuration until a provider is checked and never returns credentials', async () => {
  const env = { AI_ENABLED: 'true', AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'do-not-expose', AI_API_KEY: 'do-not-expose-either' };
  const status = getAIReadiness(env); assert.equal(status.configured, true); assert.equal(status.available, false); assert.equal(status.dependencyVerification, 'not_checked');
  assert.equal(status.planner.available, true); assert.ok(!JSON.stringify(status).includes('do-not-expose'));
  assert.equal((await callAI([], { env: { ...env, AI_ENABLED: 'false' } })).error, 'disabled');
});
test('a failed primary provider can use the existing configured fallback within the same deadline', async () => {
  const calls = [];
  const result = await callAI([{ role: 'user', content: 'test' }], { env: { AI_ENABLED: 'true', AI_PROVIDER: 'groq', AI_FALLBACK_PROVIDER: 'gemini', AI_API_KEY: 'fixture', GEMINI_API_KEY: 'fixture' },
    fetchImpl: async url => { calls.push(url); if (calls.length === 1) throw new Error('network failure'); return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }] })); } });
  assert.equal(calls.length, 2); assert.equal(result.provider, 'gemini'); assert.equal(result.providerRequestAttempted, true); assert.equal(result.content, '{"ok":true}');
});
test('plan HTTP enforces workspace access and strict scenario contract without financial writes', async () => {
  const db = fixture(); const body = { workspace: ws, ...period, scenario: { debtPaymentsInExpenses: 'none' } };
  const result = await request(db, body); assert.equal(result.status, 200); assert.equal(result.body.scenario.monthlyRemainder, 1800); assert.deepEqual(db.writes, []);
  const changed = await request(db, { ...body, baseFingerprint: '0'.repeat(64) }); assert.equal(changed.status, 409);
  const forbidden = await request(fixture({ membership: false }), body); assert.equal(forbidden.status, 403);
  const extra = await request(fixture(), { ...body, amount: 999 }); assert.equal(extra.status, 400);
  const conflicting = await request(fixture(), body, '/plan?workspace=foreign'); assert.equal(conflicting.status, 400);
  const readiness = await request(fixture(), null, '/status'); assert.equal(readiness.status, 200); assert.equal(readiness.body.enabled, false);
});
test('chat opens the reviewable planner when asked for a plan', async () => {
  const c = await context(); const answer = await chatWithAssistant('Quero montar meu plano financeiro', c, { call: noAI });
  assert.equal(answer.actionHref, '/planejador'); assert.ok(answer.message.includes('informações a confirmar')); assert.ok(answer.factIds.length);
});

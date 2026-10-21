import { z } from 'zod';
import { monetaryTotal, monthlyAverage } from './financial.js';
import { toCents, fromCents } from './money.js';
import { nonnegativeMoney } from './schemas.js';

export const PLANNER_VERSION = 'planner-v1';
// These values are reviewable scenario assumptions, never posted transactions.
export const plannerScenarioSchema = z.object({
  monthlyIncome: nonnegativeMoney.optional(),
  monthlyExpenseLimit: nonnegativeMoney.optional(),
  debtPaymentsInExpenses: z.enum(['unknown', 'all', 'none']).default('unknown'),
  monthlyContributionLimit: nonnegativeMoney.optional(),
  priority: z.enum(['debt', 'reserve', 'goals']).default('debt'),
}).strict();

const sum = values => monetaryTotal(values);
const gap = (target, current) => fromCents(Math.max(0, toCents(target ?? 0) - toCents(current ?? 0)));
const money = value => value == null ? null : fromCents(toCents(value));
const activeDebt = row => ['active', 'negotiating'].includes(row.status);
function monthsUntil(asOf, deadline) {
  if (!deadline || deadline <= asOf) return null;
  const a = new Date(asOf + 'T12:00:00Z'), b = new Date(deadline + 'T12:00:00Z');
  return Math.max(1, (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth() - Number(b.getUTCDate() < a.getUTCDate()));
}
export function calculateFinancialPlan(context, input = {}) {
  const scenario = plannerScenarioSchema.parse(input);
  const { snapshot } = context;
  if (!snapshot.scope.id || snapshot.scope.ids.length !== 1) throw new RangeError('Selecione um espaço específico para calcular o plano.');
  const workspaceId = snapshot.scope.id;
  for (const rows of [context.debts, context.goals, context.reserves, context.recurring, context.occurrences]) {
    if ((rows ?? []).some(row => row.workspace_id !== workspaceId)) throw new RangeError('O plano recebeu registros de outro espaço.');
  }
  const complete = snapshot.coverage.complete && snapshot.coverage.requestedMonthCount > 0
    && snapshot.coverage.verifiedMonthCount === snapshot.coverage.requestedMonthCount;
  const months = complete ? snapshot.coverage.requestedMonthCount : snapshot.coverage.observedMonthCount;
  const baselineIncome = monthlyAverage(snapshot.stats.income, months);
  const baselineExpenses = monthlyAverage(snapshot.stats.expenses, months);
  const explicitBaseline = scenario.monthlyIncome !== undefined && scenario.monthlyExpenseLimit !== undefined;
  const monthlyIncome = scenario.monthlyIncome ?? baselineIncome;
  const monthlyExpenseLimit = scenario.monthlyExpenseLimit ?? baselineExpenses;
  const debts = (context.debts ?? []).filter(activeDebt).map(row => ({
    id: row.id, name: row.name, balance: money(row.current_balance ?? row.original_amount),
    installment: money(row.installment_amount), interestRate: row.interest_rate == null ? null : Number(row.interest_rate),
    factIds: ['debt.' + row.id + '.balance', 'debt.' + row.id + '.installment'],
  }));
  const missingInstallments = debts.some(row => !(row.installment > 0) && row.balance > 0);
  const registeredInstallments = sum(debts.map(row => row.installment ?? 0));
  const debtOverlapUnknown = registeredInstallments > 0 && scenario.debtPaymentsInExpenses === 'unknown';
  const additionalDebtCommitment = missingInstallments || debtOverlapUnknown ? null
    : scenario.debtPaymentsInExpenses === 'none' ? registeredInstallments : 0;
  const canCalculate = (complete || explicitBaseline) && monthlyIncome !== null && monthlyExpenseLimit !== null && additionalDebtCommitment !== null;
  const monthlyRemainder = canCalculate ? sum([monthlyIncome, -monthlyExpenseLimit, -additionalDebtCommitment]) : null;
  const available = monthlyRemainder === null ? null : Math.max(0, monthlyRemainder);
  const contributionLimit = available === null ? null : Math.min(available, scenario.monthlyContributionLimit ?? available);
  const budgetFactIds = ['period.income', 'period.expenses', 'debts.installments', complete ? 'coverage.verifiedMonths' : 'coverage.observedMonths'];
  const missing = [];
  if (!complete) missing.push({ code: 'partial_history', message: 'O histórico ainda não está totalmente conciliado. As médias descrevem apenas os registros revisados.', action: '/conferir-extratos' });
  if (!months) missing.push({ code: 'no_history', message: 'Não há meses observados para calcular médias. Informe renda e limite de despesas para simular.', action: '/lancamentos' });
  if (snapshot.stats.cashBalance === null) missing.push({ code: 'unknown_cash', message: 'O saldo de caixa não está confirmado; a projeção de saldo fica indisponível.', action: '/conferir-extratos' });
  if (missingInstallments) missing.push({ code: 'missing_installments', message: 'Há dívidas sem parcela cadastrada. Atualize o compromisso antes de distribuir a sobra mensal.', action: '/pendencias' });
  if (debtOverlapUnknown) missing.push({ code: 'debt_overlap', message: 'Confirme se as parcelas cadastradas já estão dentro do limite de despesas para evitar contar o mesmo pagamento duas vezes.', action: null });
  if ((context.incompleteSchedules ?? []).length) missing.push({ code: 'incomplete_schedules', message: 'Há recorrências sem data inicial. Esses vencimentos ficam fora da projeção.', action: '/contas-fixas' });
  if (debts.some(row => row.interestRate === null)) missing.push({ code: 'missing_debt_rates', message: 'Há dívidas sem taxa informada. A ordem usa primeiro as taxas cadastradas; confira as condições com o credor.', action: '/pendencias' });
  const goals = (context.goals ?? []).filter(row => row.status === 'active').map(row => {
    const remaining = gap(row.target_amount, row.current_amount), monthsLeft = monthsUntil(snapshot.period.asOf, row.deadline);
    return { id: row.id, name: row.name, remaining, deadline: row.deadline, monthsLeft,
      monthlyRequired: monthsLeft ? fromCents(Math.ceil(toCents(remaining) / monthsLeft)) : null,
      needsDeadline: remaining > 0 && !monthsLeft, factIds: ['goal.' + row.id + '.remaining'] };
  }).sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || a.id.localeCompare(b.id));
  if (goals.some(row => row.needsDeadline)) missing.push({ code: 'goal_deadline', message: 'Há metas sem prazo futuro. Defina o prazo antes de calcular a contribuição necessária.', action: '/metas' });
  const reserve = { declared: context.emergencyReserve?.current_amount ?? null,
    target: context.emergencyReserve?.target_amount ?? null,
    remaining: context.emergencyReserve ? gap(context.emergencyReserve.target_amount, context.emergencyReserve.current_amount) : null,
    factIds: ['reserve.current', 'reserve.target'] };
  if (!context.emergencyReserve) missing.push({ code: 'missing_reserve', message: 'A reserva não foi cadastrada. Isso não confirma que ela seja zero.', action: '/reserva' });
  const obligations = (context.occurrences ?? []).filter(row => row.status !== 'paid');
  const future = obligations.filter(row => row.due_date > snapshot.period.asOf);
  const overdue = obligations.filter(row => row.status === 'overdue');
  const projected = context.cashFlowProjection ?? [];
  const projectedBalances = projected.map(row => row.projectedBalance).filter(value => value !== null);
  const firstShortfall = projected.find(row => row.projectedBalance !== null && row.projectedBalance < 0);
  const commitments = { next30DaysIncome: sum(future.filter(row => row.type === 'income').map(row => row.amount)),
    next30DaysExpense: sum(future.filter(row => row.type !== 'income').map(row => row.amount)),
    overdueExpense: sum(overdue.filter(row => row.type !== 'income').map(row => row.amount)),
    occurrences: obligations, projection: projected, minimumProjectedBalance: projectedBalances.length ? Math.min(...projectedBalances) : null,
    firstShortfallDate: firstShortfall?.date ?? null, factIds: ['accounts.cash', 'recurring.schedule'] };
  const steps = [];
  const step = (id, title, description, factIds, href, priority = 'normal', calculation = null) => {
    const evidence = factIds.map(id => context.facts.find(f => f.id === id));
    if (evidence.some(f => !f)) throw new RangeError('Fato indisponível para o planejamento.');
    steps.push({ id, title, description, factIds, evidence, href, priority, calculation });
  };
  if (!complete) step('coverage', 'Conferir a base do plano', 'Revise os movimentos pendentes e o fechamento das contas. O plano permanece provisório até essa conferência.', ['coverage.pending', 'coverage.verifiedMonths'], '/conferir-extratos', 'first');
  if (overdue.some(row => row.type !== 'income')) step('overdue', 'Revisar vencimentos em atraso', 'Confirme as ocorrências em aberto e a data de pagamento. O valor não foi debitado novamente nem recebeu uma data inventada.', ['recurring.schedule'], '/contas-fixas', 'first', { amount: commitments.overdueExpense, formula: 'Soma das ocorrências de despesa em atraso não liquidadas.' });
  if (firstShortfall) step('cash_shortfall', 'Conferir o caixa antes dos vencimentos', 'O cenário de recorrências apresenta caixa negativo a partir de ' + firstShortfall.date + '. Confira as datas de recebimento e pagamento antes de decidir sobre contribuições.', ['accounts.cash', 'recurring.schedule'], '/contas-fixas', 'first', { amount: -commitments.minimumProjectedBalance, formula: 'Déficit no menor saldo de caixa do cenário de recorrências; não é uma nova despesa.' });
  if (monthlyRemainder !== null && monthlyRemainder < 0) step('deficit', 'Ajustar o orçamento do cenário', 'O cenário apresenta déficit mensal. Revise o limite de despesas e as parcelas antes de propor novas contribuições.', ['period.income', 'period.expenses', 'debts.installments'], '/orcamento', 'first', { amount: -monthlyRemainder, formula: 'Despesas + parcelas adicionais − renda do cenário.' });
  let remainingCents = contributionLimit === null ? null : toCents(contributionLimit);
  const allocations = [];
  const candidates = {
    debt: [...debts].sort((a, b) => (b.interestRate ?? -1) - (a.interestRate ?? -1) || a.id.localeCompare(b.id)).filter(row => row.balance > 0)
      .map(row => ({ kind: 'debt', recordId: row.id, name: row.name, desired: gap(row.balance, row.installment), factIds: row.factIds, href: '/pendencias' })),
    reserve: reserve.remaining > 0 ? [{ kind: 'reserve', recordId: null, name: 'Reserva', desired: reserve.remaining, factIds: reserve.factIds, href: '/reserva' }] : [],
    goals: goals.filter(row => row.monthlyRequired > 0).map(row => ({ kind: 'goal', recordId: row.id, name: row.name, desired: Math.min(row.remaining, row.monthlyRequired), factIds: row.factIds, href: '/metas' })),
  };
  const order = [scenario.priority, ...['debt', 'reserve', 'goals'].filter(key => key !== scenario.priority)];
  for (const key of order) for (const item of candidates[key]) {
    const poolBefore = remainingCents === null ? null : fromCents(remainingCents);
    const cents = remainingCents === null ? null : Math.min(toCents(item.desired), remainingCents);
    const amount = cents === null ? null : fromCents(cents);
    if (cents !== null) remainingCents -= cents;
    allocations.push({ ...item, amount, funded: amount !== null && amount >= item.desired });
    step('contribution.' + item.kind + '.' + (item.recordId ?? 'reserve'), 'Revisar contribuição: ' + item.name,
      amount === null ? 'A contribuição aguarda uma base mensal suficiente e a confirmação das parcelas.' : 'Contribuição proposta dentro da sobra do cenário. Confira o compromisso e registre manualmente somente depois de decidir.',
      [...item.factIds, ...budgetFactIds], item.href, 'normal', { amount, requested: item.desired, poolBefore, poolAfter: remainingCents === null ? null : fromCents(remainingCents), formula: 'Menor valor entre necessidade cadastrada e sobra ainda não distribuída; sem rendimento presumido.' });
  }
  step('review', 'Revisar as premissas e acompanhar', 'Confira o cenário e recalcule após atualizar seus registros. Este cálculo não aprova limites nem registra pagamentos ou movimentações.', ['period.income', 'period.expenses', 'accounts.cash'], '/planejador');
  const allocated = sum(allocations.map(row => row.amount ?? 0));
  return { version: PLANNER_VERSION, status: canCalculate ? complete ? 'reviewable' : 'provisional' : 'insufficient_context',
    title: 'Planejador financeiro', diagnostic: { monthlyIncome: baselineIncome, monthlyExpenses: baselineExpenses, averageMonths: months,
      averageBasis: complete ? 'verified_months_including_zero_activity' : 'observed_months_partial',
      cashBalance: snapshot.stats.cashBalance, periodResult: snapshot.stats.periodBalance },
    scenario: { assumptions: scenario, monthlyIncome, monthlyExpenseLimit, incomeSource: scenario.monthlyIncome === undefined ? 'registered_history' : 'user_scenario',
      expenseSource: scenario.monthlyExpenseLimit === undefined ? 'registered_history' : 'user_scenario', registeredDebtInstallments: registeredInstallments,
      additionalDebtCommitment, monthlyRemainder, contributionLimit, allocated, unallocated: remainingCents === null ? null : fromCents(remainingCents),
      factIds: budgetFactIds, scenarioFields: Object.keys(input),
      budgetUnallocated: available === null ? null : sum([available, -allocated]), feasible: monthlyRemainder === null ? null : monthlyRemainder >= 0,
      formula: 'Renda − limite de despesas − parcelas ainda não incluídas. Contribuições ficam limitadas à sobra positiva.' },
    debts, reserve, goals, commitments, missing, steps, allocations,
    assumptions: ['Renda e limite editados são hipóteses do cenário e não alteram os fatos financeiros.',
      'Médias históricas não comprovam renda futura. Valores de metas e reserva não são somados ao caixa.',
      'Recorrências usam suas datas e frequências cadastradas. Elas compõem um cenário de caixa separado e não são somadas novamente às médias.',
      'A distribuição segue a prioridade escolhida e usa apenas a sobra calculável. Nenhum retorno de investimento ou desconto de dívida é presumido.',
      'Metas usam meses inteiros até o prazo, com mínimo de um mês e contribuição arredondada para cima em centavos.',
      'Cadastros de dívida, reserva, meta e recorrência refletem o estado atual; não reconstituem o passado.'],
    factIds: context.facts.map(row => row.id), factsVersion: snapshot.factsVersion, fingerprint: context.fingerprint,
    period: snapshot.period, scope: snapshot.scope, generatedAt: context.generatedAt, financialWrites: false };
}

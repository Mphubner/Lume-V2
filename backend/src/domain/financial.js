import { toCents, fromCents, validDate, today } from './money.js';

export const FACTS_VERSION = 'financial-v1';
export const SCORE_VERSION = 'coverage-v1';
export const dateOnly = value => new Date(value).toISOString().slice(0, 10);
export function addDays(value, days) {
  if (!validDate(value) || !Number.isInteger(days)) throw new RangeError('Data inválida.');
  const result = new Date(`${value}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return dateOnly(result);
}
export function monthEnd(year, month) { return dateOnly(new Date(Date.UTC(year, month, 0, 12))); }
export function monthKeys(startDate, endDate) {
  if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) throw new RangeError('Período inválido.');
  const result = [];
  const cursor = new Date(`${startDate.slice(0, 7)}-01T12:00:00Z`);
  while (dateOnly(cursor) <= endDate) {
    result.push(dateOnly(cursor).slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    if (result.length > 120) throw new RangeError('Selecione até dez anos por consulta.');
  }
  return result;
}
export function resolvePeriod(query = {}, { asOf = today(), defaultMonths = 12 } = {}) {
  if (!validDate(asOf)) throw new RangeError('Data de referência inválida.');
  if (!Number.isInteger(defaultMonths) || defaultMonths < 1 || defaultMonths > 120) throw new RangeError('Horizonte inválido.');
  const preset = query.period ?? '';
  if (!['', 'month', '3months', '6months', '12months', 'year'].includes(preset)) throw new RangeError('Período desconhecido.');
  const month = query.month === undefined ? undefined : Number(query.month);
  const year = query.year === undefined ? undefined : Number(query.year);
  let startDate = query.start_date ?? query.startDate;
  let endDate = query.end_date ?? query.endDate;
  if (preset && (month !== undefined || year !== undefined || startDate || endDate)) throw new RangeError('Não misture períodos predefinidos e datas.');
  if (month !== undefined || year !== undefined) {
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 1900 || year > 2200 || startDate || endDate) {
      throw new RangeError('Informe um mês e ano válidos, sem misturar filtros de período.');
    }
    startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    endDate = monthEnd(year, month);
  } else if (!startDate && !endDate) {
    const cursor = new Date(`${asOf.slice(0, 7)}-01T12:00:00Z`);
    if (preset === 'year') cursor.setUTCMonth(0);
    else cursor.setUTCMonth(cursor.getUTCMonth() - (({ month: 1, '3months': 3, '6months': 6, '12months': 12 }[preset] ?? defaultMonths) - 1));
    startDate = dateOnly(cursor);
    endDate = asOf;
  }
  if (!validDate(startDate) || !validDate(endDate) || startDate > endDate || startDate > asOf) throw new RangeError('Período inválido ou ainda não observado.');
  const requestedEndDate = endDate;
  endDate = endDate < asOf ? endDate : asOf;
  const months = monthKeys(startDate, endDate);
  return { startDate, endDate, requestedEndDate, asOf, months, basis: 'posted_reconciled' };
}
export function completedPeriod(asOf = today(), months = 3) {
  const endDate = addDays(`${asOf.slice(0, 7)}-01`, -1);
  const cursor = new Date(`${endDate.slice(0, 7)}-01T12:00:00Z`);
  cursor.setUTCMonth(cursor.getUTCMonth() - months + 1);
  return { start_date: dateOnly(cursor), end_date: endDate };
}
export function monetaryTotal(values) {
  let total = 0;
  for (const value of values) {
    total += toCents(value);
    if (!Number.isSafeInteger(total)) throw new RangeError('Total excede a precisão monetária suportada.');
  }
  return fromCents(total);
}
export function monthlyAverage(value, months) {
  if (!Number.isInteger(months) || months <= 0) return null;
  return fromCents(Math.round(toCents(value) / months));
}
export function coverageWarnings(coverage) {
  const warnings = [];
  if (!coverage.accountCount) warnings.push('Nenhuma conta cadastrada neste espaço.');
  if (coverage.unknownBalanceAccounts) warnings.push('Há contas sem saldo-base datado ou com movimentos pendentes; o saldo consolidado está incompleto.');
  if (coverage.pendingTransactions) warnings.push('Movimentos aguardando revisão não entram nos indicadores.');
  if (coverage.legacyTransactions) warnings.push('Há movimentos legados que precisam de revisão.');
  if (coverage.unresolvedTransfers) warnings.push('Transferências sem par confirmado estão fora do resultado e precisam de revisão.');
  if (coverage.boundaryTransfers) warnings.push('Há transferências com contraparte fora deste perímetro; não representam receita ou despesa econômica.');
  if (coverage.invalidRefunds) warnings.push('Há estornos sem vínculo válido com o movimento original.');
  if (coverage.invalidTransactions) warnings.push('Há movimentos com conta, direção ou categoria inconsistente.');
  if (coverage.verifiedMonthCount < coverage.requestedMonthCount) warnings.push('Nem todos os meses possuem fechamento conciliado para todas as contas.');
  return warnings;
}
const score = value => Math.round(Math.max(0, Math.min(100, value)));
export function calculateDeterministicHealth(context) {
  const { snapshot, debts = [], reserves = [], occurrences = [] } = context;
  const coverage = snapshot.coverage;
  const observedMonths = coverage.complete ? coverage.requestedMonthCount : coverage.observedMonthCount;
  const monthlyIncome = monthlyAverage(snapshot.stats.income, observedMonths);
  const monthlyExpenses = monthlyAverage(snapshot.stats.expenses, observedMonths);
  const complete = coverage.complete && coverage.verifiedMonthCount === coverage.requestedMonthCount && coverage.requestedMonthCount > 0;
  const categories = {};
  const add = (key, value, weight, description) => { categories[key] = { score: value, weight, description }; };
  // Only registered obligations/assets are assessed; missing data never earns points.
  add('taxa_poupanca', complete && monthlyIncome > 0 ? score(((monthlyIncome - monthlyExpenses) / monthlyIncome) * 500) : null, 30, 'Poupança de vinte por cento ou mais corresponde à pontuação máxima.');
  const monthlyDebt = monetaryTotal(debts.filter(d => ['active', 'negotiating'].includes(d.status)).map(d => d.installment_amount ?? 0));
  add('gestao_dividas', complete && monthlyIncome > 0 && debts.length ? score(100 - monthlyDebt / monthlyIncome * 200) : null, 20, 'Comprometimento da renda por parcelas de dívidas cadastradas. Ausência de cadastro não prova ausência de dívida.');
  const reserve = reserves.length ? monetaryTotal(reserves.map(r => r.current_amount)) : null;
  add('reserva_emergencia', complete && monthlyExpenses > 0 && reserve !== null ? score(reserve / monthlyExpenses / 6 * 100) : null, 25, 'Reserva cadastrada em relação a seis meses das despesas observadas. Não é somada novamente ao caixa.');
  const due = occurrences.filter(o => o.due_date <= snapshot.period.endDate);
  const confirmed = due.filter(o => o.status === 'paid');
  const onTime = confirmed.filter(o => o.paid_on && o.paid_on <= o.due_date);
  add('pagamento_contas', complete && due.length ? score(onTime.length / due.length * 100) : null, 25, 'Ocorrências vencidas pagas no prazo, com liquidação confirmada, sobre todas as ocorrências vencidas.');
  add('diversificacao', null, 0, 'Não avaliada: não há posições e preços de custódia suficientes.');
  add('controle_gastos', null, 0, 'Não avaliado sem orçamento e evidência de completude comparável.');
  const assessed = Object.entries(categories).filter(([, item]) => item.score !== null && item.weight > 0);
  const assessedWeight = assessed.reduce((sum, [, item]) => sum + item.weight, 0);
  const total_score = complete && assessedWeight >= 55 ? score(assessed.reduce((sum, [, item]) => sum + item.score * item.weight, 0) / assessedWeight) : null;
  const grade = total_score === null ? null : total_score >= 80 ? 'A' : total_score >= 60 ? 'B' : total_score >= 40 ? 'C' : total_score >= 20 ? 'D' : 'F';
  return { total_score, grade, label: total_score === null ? 'Dados insuficientes' : 'Indicador dos dados cadastrados', categories,
    monthlyIncome, monthlyExpenses, observedMonths, formulaVersion: SCORE_VERSION, factsVersion: snapshot.factsVersion,
    fingerprint: context.fingerprint ?? snapshot.fingerprint, period: snapshot.period,
    coverage: { ...coverage, assessedWeight, assessedIndicators: assessed.map(([key]) => key), missingIndicators: Object.keys(categories).filter(key => categories[key].score === null), warnings: coverageWarnings(coverage) },
    insights: [],
  };
}

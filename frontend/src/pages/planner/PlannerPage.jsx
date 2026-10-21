import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ClipboardList, RefreshCw } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import './PlannerPage.css';

const cash = value => value == null ? 'Aguardando dados' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const date = value => value ? value.split('-').reverse().join('/') : 'Sem prazo';
const statusLabel = { reviewable: 'Pronto para revisar', provisional: 'Cenário provisório', insufficient_context: 'Complete a base do plano' };
function Evidence({ step }) {
  return <details className="planner-evidence"><summary>Ver origem e cálculo</summary>
    {step.calculation ? <p>{step.calculation.formula}</p> : null}
    {step.calculation?.poolBefore !== undefined ? <p>Sobra antes deste passo: {cash(step.calculation.poolBefore)}. Sobra depois: {cash(step.calculation.poolAfter)}.</p> : null}
    {step.evidence.map(fact => <p key={fact.id}>{fact.label}: {fact.unit === 'BRL' ? cash(fact.value) : fact.unit === 'schedule' ? `${fact.value.length} ocorrências cadastradas` : fact.value ?? 'Não informado'}.
      {' '}{fact.source?.historicalReconstruction === false ? 'Cadastro atual.' : 'Retrato financeiro do período.'}</p>)}
  </details>;
}
function WorkspacePlan({ workspace, period, userId }) {
  const query = useQuery({ queryKey: ['financial-plan', userId, workspace, period], queryFn: () => api.getFinancialPlan({ workspace, period }), staleTime: 30000, retry: false });
  const ai = useQuery({ queryKey: ['ai-status', userId], queryFn: () => api.getAIStatus(), staleTime: 30000, retry: false });
  const [revised, setRevised] = useState(null);
  const [form, setForm] = useState({ monthlyIncome: '', monthlyExpenseLimit: '', monthlyContributionLimit: '', debtPaymentsInExpenses: 'unknown', priority: 'debt' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const plan = revised ?? query.data;
  const edit = event => setForm(previous => ({ ...previous, [event.target.name]: event.target.value }));
  async function calculate(event) {
    event.preventDefault(); setBusy(true); setError(null);
    const scenario = Object.fromEntries(Object.entries(form).filter(([, value]) => value !== ''));
    try { setRevised(await api.getFinancialPlan({ workspace, period, scenario, baseFingerprint: plan.fingerprint })); }
    catch (failure) { setError(failure); }
    finally { setBusy(false); }
  }
  async function reload() {
    setRevised(null); setError(null); await query.refetch();
  }
  if (query.isPending) return <p role="status">Conferindo os dados para o plano…</p>;
  if (query.error || !plan) return <section className="card"><p role="alert">{query.error?.message || 'Não foi possível calcular o plano.'}</p><button className="btn btn-primary" onClick={reload}>Tentar novamente</button></section>;
  const projection = plan.commitments.projection;
  const projectedEnd = projection.at(-1);
  const aiNotice = !ai.data?.enabled ? 'A apresentação com IA está desativada ou indisponível.'
    : !ai.data.configured ? 'A integração de IA precisa de configuração.'
      : ai.data.dependencyVerification === 'not_checked' ? 'Integração de IA configurada; conexão ainda não verificada.' : 'O estado da integração considera a última solicitação.';
  return <>
    <section className="card planner-intro">
      <div><span className="planner-badge">{statusLabel[plan.status]}</span><h2>Um plano a partir dos seus registros</h2><p>{date(plan.period.startDate)} a {date(plan.period.endDate)} · {plan.coverage.verifiedMonthCount} meses conciliados · {plan.coverage.pendingTransactions} movimentos pendentes.</p></div>
      <button className="btn btn-secondary" onClick={reload} disabled={query.isFetching || busy}><RefreshCw size={15} /> Atualizar base</button>
      <p className="planner-small">{plan.mode === 'assisted_presentation' ? 'A IA ajudou a destacar passos calculados.' : 'Plano calculado por regras verificáveis.'} {aiNotice}</p>
    </section>
    {plan.missing.length ? <section className="card planner-attention" aria-label="Informações a conferir"><h3>Antes de decidir</h3><ul>{plan.missing.map(item => <li key={item.code}>{item.message} {item.action ? <Link to={item.action}>Conferir</Link> : null}</li>)}</ul></section> : null}
    <div className="planner-metrics">
      <article className="card"><span>Renda média registrada</span><strong>{cash(plan.diagnostic.monthlyIncome)}</strong><p>{plan.diagnostic.averageMonths} meses {plan.diagnostic.averageBasis === 'observed_months_partial' ? 'observados · base parcial' : 'conciliados, incluindo meses sem atividade'}.</p></article>
      <article className="card"><span>Despesa média registrada</span><strong>{cash(plan.diagnostic.monthlyExpenses)}</strong><p>Despesas líquidas de estornos. Transferências e principal ficam separados.</p></article>
      <article className="card"><span>Saldo de caixa registrado</span><strong>{cash(plan.diagnostic.cashBalance)}</strong><p>Reserva e valores das metas não são somados novamente ao saldo.</p></article>
    </div>
    <section className="card"><h2>Revisar cenário mensal</h2><p>Campos vazios usam as médias acima. Com histórico parcial, informe renda e limite para simular. Os valores digitados são premissas e não alteram os registros.</p>
      <form onSubmit={calculate} className="planner-form">
        <label>Renda mensal do cenário<input name="monthlyIncome" type="number" min="0" step="0.01" value={form.monthlyIncome} onChange={edit} placeholder={plan.diagnostic.monthlyIncome ?? 'Informe a renda'} /></label>
        <label>Limite mensal de despesas<input name="monthlyExpenseLimit" type="number" min="0" step="0.01" value={form.monthlyExpenseLimit} onChange={edit} placeholder={plan.diagnostic.monthlyExpenses ?? 'Informe o limite'} /></label>
        <label>Limite para novas contribuições<input name="monthlyContributionLimit" type="number" min="0" step="0.01" value={form.monthlyContributionLimit} onChange={edit} placeholder="Toda a sobra calculada" /></label>
        <label>Parcelas de dívidas no limite de despesas<select name="debtPaymentsInExpenses" value={form.debtPaymentsInExpenses} onChange={edit}><option value="unknown">Preciso conferir</option><option value="all">Todas já estão incluídas</option><option value="none">Nenhuma está incluída</option></select></label>
        <label>Prioridade para a sobra<select name="priority" value={form.priority} onChange={edit}><option value="debt">Dívidas, reserva e metas</option><option value="reserve">Reserva, dívidas e metas</option><option value="goals">Metas, dívidas e reserva</option></select></label>
        <div className="planner-form-action"><button className="btn btn-primary" disabled={busy || query.isFetching} type="submit">{busy ? 'Calculando…' : 'Calcular cenário'}</button></div>
      </form>
      {error ? <div role="alert" className="planner-error"><p>{error.message}</p>{error.status === 409 ? <button className="btn btn-secondary" onClick={reload}>Atualizar dados e revisar novamente</button> : null}</div> : null}
      <div className="planner-equation"><span>Renda: <b>{cash(plan.scenario.monthlyIncome)}</b></span><span>Limite de despesas: <b>{cash(plan.scenario.monthlyExpenseLimit)}</b></span><span>Parcelas adicionais: <b>{cash(plan.scenario.additionalDebtCommitment)}</b></span><span>Sobra do cenário: <b>{cash(plan.scenario.monthlyRemainder)}</b></span></div>
      <p className="planner-small">{plan.scenario.formula} {plan.scenario.incomeSource === 'user_scenario' || plan.scenario.expenseSource === 'user_scenario' ? 'Este cenário inclui valores que você informou.' : 'Este cenário usa as médias dos registros.'}</p>
      <p>Contribuições propostas: <strong>{plan.scenario.contributionLimit === null ? 'Aguardando base suficiente' : cash(plan.scenario.allocated)}</strong>. Sobra ainda sem destino: <strong>{cash(plan.scenario.budgetUnallocated)}</strong>.</p>
    </section>
    <section className="card"><h2>Seus próximos passos</h2><ol className="planner-steps">{plan.steps.map(step => <li key={step.id} className={plan.highlightedStepIds.includes(step.id) ? 'planner-highlight' : ''}>
      <div className="planner-step-title"><h3>{step.title}</h3>{step.calculation?.amount !== undefined ? <strong>{cash(step.calculation.amount)}</strong> : null}</div><p>{step.description}</p><Evidence step={step} />{step.href !== '/planejador' ? <Link to={step.href}>Abrir para revisar</Link> : null}
    </li>)}</ol></section>
    <div className="planner-columns">
      <section className="card"><h2>Dívidas e reserva</h2>{plan.debts.length ? plan.debts.map(debt => <p key={debt.id}><strong>{debt.name}</strong>: {cash(debt.balance)} · parcela {cash(debt.installment)}.</p>) : <p>Nenhuma dívida cadastrada; isso não comprova ausência de compromissos.</p>}<p>Reserva declarada: <strong>{cash(plan.reserve.declared)}</strong>. Alvo: {cash(plan.reserve.target)}. Falta: {cash(plan.reserve.remaining)}.</p></section>
      <section className="card"><h2>Metas e prazo</h2>{plan.goals.length ? plan.goals.map(goal => <p key={goal.id}><strong>{goal.name}</strong>: faltam {cash(goal.remaining)}. Prazo: {date(goal.deadline)}. Contribuição necessária: {cash(goal.monthlyRequired)} por mês.</p>) : <p>Nenhuma meta ativa cadastrada.</p>}</section>
    </div>
    <section className="card"><h2>Próximos 30 dias pelas recorrências</h2><p>Receitas previstas: <strong>{cash(plan.commitments.next30DaysIncome)}</strong> · despesas previstas: <strong>{cash(plan.commitments.next30DaysExpense)}</strong>. Em atraso no período: {cash(plan.commitments.overdueExpense)}.</p><p>Saldo de caixa do cenário em {date(projectedEnd?.date)}: <strong>{cash(projectedEnd?.projectedBalance)}</strong>.</p><p className="planner-small">Este cenário aplica as frequências cadastradas às datas futuras. Não inclui novos aportes acima, despesas avulsas nem pagamentos em atraso sem data confirmada.</p>
      {plan.commitments.firstShortfallDate ? <p>O caixa fica negativo a partir de {date(plan.commitments.firstShortfallDate)}. Menor saldo do cenário: <strong>{cash(plan.commitments.minimumProjectedBalance)}</strong>.</p> : null}
      <details><summary>Ver vencimentos e entradas previstas</summary><ul>{plan.commitments.occurrences.filter(row => row.due_date > plan.period.asOf).map(row => <li key={row.id}>{date(row.due_date)} · {row.name} · {row.type === 'income' ? 'Entrada' : 'Saída'} de {cash(row.amount)}</li>)}</ul></details>
    </section>
    <section className="card planner-small"><h3>Premissas do plano</h3><ul>{plan.assumptions.map(item => <li key={item}>{item}</li>)}</ul><p>Base: {plan.factsVersion} · referência {date(plan.period.asOf)} · revisão {plan.planFingerprint.slice(0, 12)}.</p></section>
  </>;
}
export default function PlannerPage() {
  const { currentWorkspace, workspaceLabel } = useWorkspace();
  const { user } = useAuth();
  const [period, setPeriod] = useState('3months');
  return <div className="planner-page"><div className="page-header"><div><h1><ClipboardList size={25} /> Planejador financeiro</h1><p>Diagnóstico, prioridades e um cenário para revisar em {workspaceLabel}.</p></div><label className="planner-period">Período da base<select aria-label="Período da base do plano" value={period} onChange={event => setPeriod(event.target.value)}><option value="month">Este mês</option><option value="3months">Últimos 3 meses</option><option value="6months">Últimos 6 meses</option><option value="12months">Últimos 12 meses</option><option value="year">Este ano</option></select></label></div>
    {currentWorkspace === 'all' ? <section className="card"><h2>Escolha o espaço do plano</h2><p>Selecione um espaço pessoal, familiar ou empresarial no menu para planejar os recursos e compromissos desse espaço.</p></section> : <WorkspacePlan key={`${user?.id}:${currentWorkspace}:${period}`} workspace={currentWorkspace} period={period} userId={user?.id} />}
  </div>;
}

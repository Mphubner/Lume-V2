import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PlannerPage from '../src/pages/planner/PlannerPage';
import Chatbot from '../src/components/ui/Chatbot';
import api from '../src/services/api';
const context = vi.hoisted(() => ({ workspace: 'ws-A', user: 'user-A' }));
vi.mock('../src/context/WorkspaceContext', () => ({ useWorkspace: () => ({ currentWorkspace: context.workspace, workspaceLabel: context.workspace }) }));
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: context.user } }) }));
vi.mock('../src/services/api', () => ({ default: { getFinancialPlan: vi.fn(), getAIStatus: vi.fn(), chat: vi.fn() } }));
function plan(name = 'Passo de A') {
  return { status: 'insufficient_context', mode: 'deterministic', period: { startDate: '2026-08-01', endDate: '2026-10-20', asOf: '2026-10-20' },
    coverage: { verifiedMonthCount: 1, pendingTransactions: 2 }, missing: [{ code: 'partial', message: 'Histórico parcial. Confira a base.', action: '/conferir-extratos' }],
    diagnostic: { monthlyIncome: 5000, monthlyExpenses: 3000, averageMonths: 2, averageBasis: 'observed_months_partial', cashBalance: null },
    scenario: { monthlyIncome: 5000, monthlyExpenseLimit: 3000, additionalDebtCommitment: null, monthlyRemainder: null, contributionLimit: null, allocated: 0, budgetUnallocated: null, formula: 'Renda menos despesas e parcelas.', incomeSource: 'registered_history', expenseSource: 'registered_history' },
    steps: [{ id: 'coverage', title: name, description: 'Revise os movimentos.', factIds: ['coverage.pending'], evidence: [{ id: 'coverage.pending', label: 'Movimentos pendentes', value: 2, unit: 'count', source: {} }], href: '/conferir-extratos' }],
    highlightedStepIds: ['coverage'], debts: [], reserve: { declared: null, target: null, remaining: null }, goals: [],
    commitments: { projection: [], occurrences: [], next30DaysIncome: 0, next30DaysExpense: 0, overdueExpense: 0 },
    assumptions: ['Valores editados são premissas.'], factsVersion: 'financial-v1', fingerprint: 'a'.repeat(64), planFingerprint: 'b'.repeat(64) };
}
function surface() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = () => <MemoryRouter><QueryClientProvider client={client}><PlannerPage /></QueryClientProvider></MemoryRouter>;
  return { ...render(view()), redraw: view };
}
describe('Planejador com cenário revisável', () => {
  beforeEach(() => {
    vi.clearAllMocks(); context.workspace = 'ws-A'; context.user = 'user-A';
    api.getFinancialPlan.mockResolvedValue(plan()); api.getAIStatus.mockResolvedValue({ enabled: false, configured: false });
  });
  it('não mistura recursos do consolidado e orienta selecionar um espaço', async () => {
    context.workspace = 'all'; surface(); await screen.findByText('Escolha o espaço do plano'); expect(api.getFinancialPlan).not.toHaveBeenCalled();
  });
  it('mostra insuficiência e envia somente hipóteses revisáveis vinculadas à versão dos fatos', async () => {
    surface(); await screen.findByText('Passo de A'); expect(screen.getByText('Complete a base do plano')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Renda mensal do cenário'), { target: { value: '4500' } });
    fireEvent.change(screen.getByLabelText('Limite mensal de despesas'), { target: { value: '3000' } });
    fireEvent.change(screen.getByLabelText('Parcelas de dívidas no limite de despesas'), { target: { value: 'none' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calcular cenário' }));
    await waitFor(() => expect(api.getFinancialPlan).toHaveBeenLastCalledWith({ workspace: 'ws-A', period: '3months', baseFingerprint: 'a'.repeat(64), scenario: { monthlyIncome: '4500', monthlyExpenseLimit: '3000', debtPaymentsInExpenses: 'none', priority: 'debt' } }));
    fireEvent.click(screen.getByText('Ver origem e cálculo')); expect(screen.getByText(/Movimentos pendentes: 2/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Abrir para revisar' }).getAttribute('href')).toBe('/conferir-extratos');
  });
  it('mantém o formulário e solicita nova base se os dados mudaram', async () => {
    surface(); await screen.findByText('Passo de A');
    api.getFinancialPlan.mockRejectedValueOnce(Object.assign(new Error('Os dados mudaram. Recarregue a base.'), { status: 409 }));
    fireEvent.change(screen.getByLabelText('Renda mensal do cenário'), { target: { value: '4500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Calcular cenário' })); await screen.findByRole('alert');
    expect(screen.getByLabelText('Renda mensal do cenário').value).toBe('4500'); expect(screen.getByRole('button', { name: 'Atualizar dados e revisar novamente' })).toBeTruthy();
  });
  it('descarta respostas atrasadas e cenário ao trocar o espaço', async () => {
    let resolveOld;
    api.getFinancialPlan.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValue(plan('Passo de B'));
    const view = surface(); await waitFor(() => expect(api.getFinancialPlan).toHaveBeenCalledOnce());
    context.workspace = 'ws-B'; view.rerender(view.redraw()); await screen.findByText('Passo de B');
    await act(async () => resolveOld(plan('Passo privado antigo'))); expect(screen.queryByText('Passo privado antigo')).toBeNull();
    expect(api.getFinancialPlan).toHaveBeenLastCalledWith({ workspace: 'ws-B', period: '3months' });
  });
  it('chat abre o planejador e limpa a conversa ao mudar o espaço', async () => {
    api.chat.mockResolvedValue({ message: 'Resposta privada de A', actionHref: '/planejador', period: { startDate: '2026-08-01', endDate: '2026-10-20' }, coverage: { complete: false } });
    const view = render(<MemoryRouter><Chatbot /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Converse com a Lume/ }));
    expect(screen.getByRole('link', { name: 'Abrir Planejador financeiro' }).getAttribute('href')).toBe('/planejador');
    fireEvent.change(screen.getByLabelText('Mensagem para a Lume'), { target: { value: 'Monte meu plano' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' })); await screen.findByText('Resposta privada de A');
    context.workspace = 'ws-B'; view.rerender(<MemoryRouter><Chatbot /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Converse com a Lume/ })); expect(screen.queryByText('Resposta privada de A')).toBeNull();
  });
});

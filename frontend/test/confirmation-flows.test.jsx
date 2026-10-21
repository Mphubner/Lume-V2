import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RecurringPage from '../src/pages/recurring/RecurringPage';
import OnboardingPage from '../src/pages/auth/OnboardingPage';
import api from '../src/services/api';
const refreshProfile = vi.hoisted(() => vi.fn());
vi.mock('../src/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'marcos' }, refreshProfile }) }));
vi.mock('../src/context/WorkspaceContext', () => ({ useWorkspace: () => ({ workspaces: [{ id: 'personal-A', kind: 'personal', role: 'owner' }] }) }));
vi.mock('../src/services/api', () => ({ default: { request: vi.fn(), getTransactions: vi.fn() } }));
const occurrence = { id: 'r1:2026-09-01', recurring_id: 'r1', name: 'Aluguel', amount: 500, due_date: '2026-09-01', type: 'expense', workspace_id: 'family-A', status: 'overdue' };
describe('Confirmação financeira explícita', () => {
  beforeEach(() => {
    api.request.mockResolvedValue({ bills: [], occurrences: [occurrence], stats: { paidThisMonth: 0, pending: 1, overdue: 1 } });
    api.getTransactions.mockResolvedValue({ transactions: [{ id: 'real-payment', amount: -500, description: 'Aluguel setembro', date: '2026-09-01', economic_kind: 'standard', workspace_id: 'family-A' }], totalPages: 1 });
  });
  it('vencimento permanece vencido e exige lançamento real antes de confirmar pagamento', async () => {
    render(<MemoryRouter><RecurringPage /></MemoryRouter>); await screen.findByText('Vencida');
    expect(screen.queryByText('Pago com lançamento vinculado')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Vincular pagamento' }));
    await screen.findByRole('option', { name: /Aluguel setembro/ });
    expect(screen.getByRole('button', { name: 'Confirmar vínculo' }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Lançamento confirmado'), { target: { value: 'real-payment' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar vínculo' }));
    await waitFor(() => expect(api.request).toHaveBeenCalledWith('/recurring/r1/confirm', { method: 'POST', body: { due_date: '2026-09-01', transaction_id: 'real-payment' } }));
  });
  it('desvincula ocorrência paga sem excluir o lançamento bancário', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let paid = true;
    api.request.mockImplementation(async (path, options) => {
      if (options?.method === 'DELETE') { paid = false; return { success: true }; }
      return { bills: [], occurrences: [{ ...occurrence, status: paid ? 'paid' : 'overdue' }], stats: { paidThisMonth: paid ? 1 : 0 } };
    });
    render(<MemoryRouter><RecurringPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Desvincular pagamento' }));
    await screen.findByText('Vencida');
    expect(api.request).toHaveBeenCalledWith('/recurring/r1/occurrences/2026-09-01', { method: 'DELETE' });
    expect(api.request.mock.calls.some(([path]) => path.startsWith('/transactions'))).toBe(false);
  });
  it('onboarding com erro de persistência não conclui o perfil nem sai do formulário', async () => {
    api.request.mockRejectedValue(new Error('Falha ao salvar conta'));
    render(<MemoryRouter><OnboardingPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Nome da conta'), { target: { value: 'PicPay Marcos' } });
    fireEvent.change(screen.getByLabelText('Saldo de fechamento na data-base (R$)'), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar conta e conferir primeiro extrato' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toContain('cadastro ainda não foi concluído'); expect(refreshProfile).not.toHaveBeenCalled();
    expect(api.request).toHaveBeenCalledWith('/profile/onboarding', expect.objectContaining({ body: expect.objectContaining({ workspace: 'personal-A', account: expect.objectContaining({ balance: 200 }) }) }));
    expect(screen.getByLabelText('Nome da conta').value).toBe('PicPay Marcos');
  });
});

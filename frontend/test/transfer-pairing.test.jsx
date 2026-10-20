import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PairTransferModal from '../src/components/ui/PairTransferModal';
import api from '../src/services/api';
vi.mock('../src/services/api', () => ({ default: { getTransactions: vi.fn(), request: vi.fn() } }));
const source = { id: 'picpay-out', account_id: 'picpay', workspace_id: 'family', amount: -500, date: '2026-09-02', description: 'Transferência enviada' };
const match = { id: 'inter-in', account_id: 'inter', workspace_id: 'family', amount: 500, date: '2026-09-03', description: 'Recebimento confirmado', accounts: { name: 'Inter' } };
describe('Pareamento além da página atual', () => {
  beforeEach(() => { vi.spyOn(window, 'confirm').mockReturnValue(true); api.request.mockResolvedValue({ success: true }); });
  it('encontra contraparte na segunda página, exclui outra entidade e exige seleção explícita', async () => {
    api.getTransactions.mockImplementation(async ({ page }) => ({ transactions: page === 1 ? [{ ...match, id: 'other-company', workspace_id: 'business', description: 'Outra empresa' }] : [match], totalPages: 2 }));
    const saved = vi.fn(); render(<PairTransferModal transaction={source} onClose={vi.fn()} onSaved={saved} />);
    await screen.findByRole('option', { name: /Recebimento confirmado/ });
    expect(screen.queryByRole('option', { name: /Outra empresa/ })).toBeNull();
    expect(api.getTransactions).toHaveBeenCalledWith({ workspace: 'family', page: 2, limit: 500 });
    expect(screen.getByRole('button', { name: 'Confirmar pareamento' }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Contraparte confirmada'), { target: { value: match.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pareamento' }));
    await waitFor(() => expect(api.request).toHaveBeenCalledWith('/transactions/transfers/link', { method: 'PATCH', body: { source_transaction_id: source.id, destination_transaction_id: match.id } }));
    expect(saved).toHaveBeenCalledOnce();
  });
  it('erro na segunda página não apresenta uma busca parcial como concluída', async () => {
    api.getTransactions.mockImplementation(async ({ page }) => { if (page === 2) throw new Error('Página indisponível'); return { transactions: [match], totalPages: 2 }; });
    render(<PairTransferModal transaction={source} onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByText('Página indisponível');
    expect(screen.getByRole('button', { name: 'Confirmar pareamento' }).disabled).toBe(true);
    expect(api.request).not.toHaveBeenCalled();
  });
});

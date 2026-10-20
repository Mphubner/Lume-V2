import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ImportAuditModal from '../src/pages/import/ImportAuditModal';
import ReconciliationPage from '../src/pages/reconciliation/ReconciliationPage';
import api from '../src/services/api';
vi.mock('../src/services/api', () => ({ default: { getPendingReconciliation: vi.fn(), getCategories: vi.fn(), reconcileAll: vi.fn(), getImportHistory: vi.fn(), request: vi.fn() } }));
const rows = Array.from({ length: 251 }, (_, i) => ({ id: `row-${i}`, date: '2026-09-02', description: `Movimento ${i}`, amount_cents: i % 2 ? -100 : 100, economic_kind: 'standard', review_state: i === 4 ? 'duplicate' : 'pending', duplicate_of: i === 4 ? 'existing-transaction' : null, source: { line: i + 2, raw: `original-${i}` } }));
function fillClosing() {
  const closing = within(screen.getByText("Fechamento com a fonte").closest("form"));
  fireEvent.change(closing.getByLabelText('Saldo de abertura (R$)'), { target: { value: '100' } });
  fireEvent.change(closing.getByLabelText('Saldo de fechamento (R$)'), { target: { value: '100' } });
  fireEvent.change(closing.getByLabelText('Início do período'), { target: { value: '2026-09-01' } });
  fireEvent.change(closing.getByLabelText('Fim do período'), { target: { value: '2026-09-30' } });
  fireEvent.click(closing.getByLabelText('Conferi o período, os saldos e as linhas com o extrato original.'));
}
describe('Revisão de extratos: lote íntegro e estados verdadeiros', () => {
  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.getCategories.mockResolvedValue([]); api.reconcileAll.mockResolvedValue({ applied: 250 });
    api.getPendingReconciliation.mockImplementation(async ({ limit, offset }) => ({ transactions: rows.slice(offset, offset + limit), total: rows.length }));
  });
  it('aprova todas as 251 linhas de múltiplas páginas, incluindo a duplicata identificada', async () => {
    const close = vi.fn(); render(<ImportAuditModal importId="batch-A" onClose={close} />);
    await screen.findByText(/Linhas 1–50 de 251/);
    fireEvent.click(screen.getByText('Próxima'));
    await screen.findByText(/Linhas 51–100 de 251/);
    fillClosing(); fireEvent.click(screen.getByText('Validar fechamento e aplicar 251 linhas'));
    await waitFor(() => expect(api.reconcileAll).toHaveBeenCalledOnce());
    const payload = api.reconcileAll.mock.calls[0][0];
    expect(payload.ids).toEqual(rows.map(row => row.id));
    expect(payload.balance_check).toEqual({ opening_balance: 100, closing_balance: 100, period_start: '2026-09-01', period_end: '2026-09-30', source_confirmed: true });
    expect(close).toHaveBeenCalledOnce();
  });
  it('interrompe aprovação se o lote mudar entre páginas', async () => {
    render(<ImportAuditModal importId="batch-A" onClose={vi.fn()} />); await screen.findByText(/Linhas 1–50 de 251/);
    api.getPendingReconciliation.mockImplementation(async ({ limit, offset }) => ({ transactions: rows.slice(offset, offset + limit), total: offset === 200 ? 252 : 251 }));
    fillClosing(); fireEvent.click(screen.getByText('Validar fechamento e aplicar 251 linhas'));
    await screen.findByText(/O lote mudou durante a revisão/);
    expect(api.reconcileAll).not.toHaveBeenCalled();
  });
  it('não aplica uma lista truncada de linhas ainda que o total permaneça igual', async () => {
    render(<ImportAuditModal importId="batch-A" onClose={vi.fn()} />); await screen.findByText(/Linhas 1–50 de 251/);
    api.getPendingReconciliation.mockImplementation(async ({ limit, offset }) => ({ transactions: rows.slice(offset, offset + limit - 1), total: 251 }));
    fillClosing(); fireEvent.click(screen.getByText('Validar fechamento e aplicar 251 linhas'));
    await screen.findByText(/Nem todas as linhas foram carregadas/); expect(api.reconcileAll).not.toHaveBeenCalled();
  });
  it('mantém erro de consulta visível e desabilita aprovação', async () => {
    api.getPendingReconciliation.mockRejectedValue(new Error('Fonte indisponível'));
    render(<ImportAuditModal importId="batch-A" onClose={vi.fn()} />);
    await screen.findByText('Fonte indisponível');
    expect(screen.getByText(/Validar fechamento e aplicar/).disabled).toBe(true);
    expect(api.reconcileAll).not.toHaveBeenCalled();
  });
  it('histórico indisponível não apresenta tudo em dia ou ausência de extratos', async () => {
    api.getImportHistory.mockRejectedValue(new Error('Histórico indisponível'));
    render(<MemoryRouter><ReconciliationPage /></MemoryRouter>);
    await screen.findByText('Histórico indisponível');
    expect(screen.queryByText('Nenhum extrato importado')).toBeNull();
    expect(screen.queryByText(/tudo em dia/i)).toBeNull();
  });
});

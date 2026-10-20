import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TransactionEditModal from '../src/pages/transactions/TransactionEditModal';
import api from '../src/services/api';
vi.mock('../src/services/api', () => ({ default: { getTransactions: vi.fn() } }));
const transaction = { id: 'outgoing-transfer', description: 'Pix para Inter', amount: -500, date: '2026-09-10', type: 'transfer', economic_kind: 'transfer', linked_transaction_id: 'incoming-transfer', account_id: 'picpay', category_id: null };
const accounts = [{ id: 'picpay', name: 'PicPay' }];
describe('Edição de lançamentos e evidência de estorno', () => {
  beforeEach(() => { api.getTransactions.mockResolvedValue({ transactions: [{ id: 'purchase', amount: -50, date: '2026-09-03', description: 'Compra original', economic_kind: 'standard' }], totalPages: 1 }); });
  it('editar descrição da saída de transferência mantém -500 e bloqueia valor/conta/data', async () => {
    const save = vi.fn().mockResolvedValue();
    render(<TransactionEditModal isOpen transaction={transaction} accounts={accounts} categories={[]} family={[]} onSave={save} onClose={vi.fn()} onDelete={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('Descrição').value).toBe('Pix para Inter'));
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Transferência PicPay → Inter' } });
    expect(screen.getByLabelText('Valor (R$)').disabled).toBe(true); expect(screen.getByLabelText('Conta associada').disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('outgoing-transfer', expect.objectContaining({ amount: -500, economic_kind: 'transfer', description: 'Transferência PicPay → Inter' })));
  });
  it('estorno exige original selecionável na conta e envia vínculo explícito', async () => {
    const save = vi.fn().mockResolvedValue();
    render(<TransactionEditModal isOpen transaction={{ ...transaction, id: 'refund', linked_transaction_id: null, type: 'income', economic_kind: 'standard', amount: 50 }} accounts={accounts} categories={[]} family={[]} onSave={save} onClose={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Natureza econômica'), { target: { value: 'refund' } });
    await screen.findByRole('option', { name: /Compra original/ });
    fireEvent.change(screen.getByLabelText('Lançamento original do estorno'), { target: { value: 'purchase' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('refund', expect.objectContaining({ amount: 50, economic_kind: 'refund', reversal_of: 'purchase' })));
  });
});

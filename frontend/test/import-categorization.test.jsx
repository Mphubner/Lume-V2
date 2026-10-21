import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ImportAuditModal from '../src/pages/import/ImportAuditModal';
import api from '../src/services/api';

vi.mock('../src/services/api', () => ({ default: { getPendingReconciliation: vi.fn(), getCategories: vi.fn(), reconcileAll: vi.fn(), request: vi.fn() } }));

const categories = [
  { id: 'groceries', name: 'Mercado', type: 'expense', is_system: true, user_id: null, workspace_id: null },
  { id: 'salary', name: 'Salário', type: 'income', is_system: true, user_id: null, workspace_id: null },
  { id: 'other', name: 'Outros', type: 'both', is_system: true, user_id: null, workspace_id: null },
  { id: 'family-food', name: 'Alimentação da família', type: 'expense', is_system: false, user_id: 'fixture-owner', workspace_id: 'family-A' },
  { id: 'business-food', name: 'Alimentação da empresa', type: 'expense', is_system: false, user_id: 'fixture-owner', workspace_id: 'business-B' },
];
const suggestion = { category_id: 'groceries', subcategory: 'Supermercado', confidence: 0.96, source: 'merchant', reason: 'Estabelecimento identificado como supermercado.' };
const row = (id, overrides = {}) => ({ id, description: `Movimento ${id}`, date: '2026-09-02', workspace_id: 'family-A', amount_cents: -50000, economic_kind: 'standard', category_id: null, learn_rule: false, review_state: 'pending', category_suggestion: { ...suggestion }, ...overrides });
let reviewRows;

function renderReview() { render(<ImportAuditModal importId="fixture-batch" onClose={vi.fn()} />); }
function reviewRow(description) { return within(screen.getByText(description, { exact: true }).closest('tr')); }

describe('Categorias na conferência de extratos', () => {
  beforeEach(() => {
    reviewRows = [row('suggested')];
    api.getCategories.mockResolvedValue(categories);
    api.getPendingReconciliation.mockImplementation(async ({ limit = 50, offset = 0 }) => ({ transactions: reviewRows.slice(offset, offset + limit), total: reviewRows.length }));
    api.request.mockImplementation(async (path, options) => {
      if (options.method === 'POST') {
        reviewRows = reviewRows.map(item => options.body.ids.includes(item.id) && !item.category_id ? { ...item, category_id: item.category_suggestion.category_id, subcategory: item.category_suggestion.subcategory } : item);
        return { categorized: options.body.ids.length, skipped: 0, review_required: true };
      }
      reviewRows = reviewRows.map(item => path === `/import/rows/${item.id}` ? { ...item, ...options.body } : item);
      return {};
    });
  });

  it('explica a sugestão sem modificar categoria, natureza ou saldo ao abrir a revisão', async () => {
    renderReview();
    await screen.findByText('Sugestão: Mercado · Supermercado');
    expect(screen.getByText(/Identificação do estabelecimento · Confiança 96%/)).toBeTruthy();
    expect(screen.getByText(suggestion.reason)).toBeTruthy();
    expect(screen.getByLabelText('Categoria de Movimento suggested').value).toBe('');
    expect(api.request).not.toHaveBeenCalled();
    expect(api.reconcileAll).not.toHaveBeenCalled();
  });

  it('preenche uma sugestão por ação explícita sem aprovar o extrato', async () => {
    renderReview();
    fireEvent.click(await screen.findByRole('button', { name: 'Usar sugestão', exact: true }));
    await waitFor(() => expect(api.request).toHaveBeenCalledWith('/import/fixture-batch/categorize', { method: 'POST', body: { ids: ['suggested'] } }));
    await screen.findByText('1 categoria preenchida. 0 linhas preservadas ou sem sugestão segura. Os saldos não foram alterados.');
    expect(screen.getByLabelText('Categoria de Movimento suggested').value).toBe('groceries');
    expect(screen.getByText('Subcategoria atual: Supermercado')).toBeTruthy();
    expect(api.reconcileAll).not.toHaveBeenCalled();
  });

  it('informa zero categorias preenchidas quando o servidor preserva a linha na revalidação', async () => {
    api.request.mockResolvedValueOnce({ categorized: 0, skipped: 1, review_required: true });
    renderReview();
    fireEvent.click(await screen.findByRole('button', { name: 'Usar sugestão', exact: true }));
    await screen.findByText('0 categorias preenchidas. 1 linha preservada ou sem sugestão segura. Os saldos não foram alterados.');
    expect(screen.getByLabelText('Categoria de Movimento suggested').value).toBe('');
    expect(api.reconcileAll).not.toHaveBeenCalled();
  });

  it('usa estado de processamento neutro enquanto categoriza sem sugerir aprovação do extrato', async () => {
    let finish;
    api.request.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    renderReview();
    fireEvent.click(await screen.findByRole('button', { name: 'Usar sugestão', exact: true }));
    expect(await screen.findByRole('button', { name: 'Processando…' })).toBeTruthy();
    expect(screen.queryByText('Validando e aplicando…')).toBeNull();
    finish({ categorized: 0, skipped: 1, review_required: true });
    await screen.findByText(/0 categorias preenchidas/);
    expect(api.reconcileAll).not.toHaveBeenCalled();
  });

  it('aplica em lote apenas sugestões da página sem sobrescrever categorias ou cruzar espaços e sinais', async () => {
    reviewRows = [
      row('valid'),
      row('already-set', { category_id: 'family-food' }),
      row('other-space', { category_suggestion: { ...suggestion, category_id: 'business-food' } }),
      row('wrong-direction', { amount_cents: 20000 }),
      row('low-confidence', { category_suggestion: { ...suggestion, confidence: 0.5 } }),
      row('no-confidence', { category_suggestion: { ...suggestion, confidence: undefined } }),
      ...Array.from({ length: 45 }, (_, index) => row(`no-suggestion-${index}`, { category_suggestion: { category_id: null, confidence: 0, source: 'none', reason: 'Confira a origem.' } })),
      row('next-page'),
    ];
    renderReview();
    fireEvent.click(await screen.findByRole('button', { name: 'Usar 1 sugestão desta página' }));
    await waitFor(() => expect(api.request).toHaveBeenCalledWith('/import/fixture-batch/categorize', { method: 'POST', body: { ids: ['valid'] } }));
    expect(api.reconcileAll).not.toHaveBeenCalled();
    expect(reviewRows.find(item => item.id === 'already-set').category_id).toBe('family-food');
    expect(reviewRows.find(item => item.id === 'next-page').category_id).toBeNull();
  });

  it('oferece escolha manual por sinal e espaço, e só aprende com consentimento explícito', async () => {
    renderReview();
    const category = await screen.findByLabelText('Categoria de Movimento suggested');
    const choices = within(category).getAllByRole('option').map(option => option.value);
    expect(choices).toEqual(['', 'groceries', 'other', 'family-food']);
    fireEvent.change(category, { target: { value: 'family-food' } });
    expect(api.request).not.toHaveBeenCalled();
    const scope = reviewRow('Movimento suggested');
    fireEvent.click(scope.getByLabelText('Lembrar para próximos extratos de Movimento suggested'));
    expect(screen.getByText(/A escolha será lembrada depois que você aplicar o extrato/)).toBeTruthy();
    expect(scope.getByRole('button', { name: 'Usar sugestão', exact: true }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: /Validar fechamento e aplicar/ }).disabled).toBe(true);
    fireEvent.click(scope.getByRole('button', { name: 'Salvar categoria' }));
    await waitFor(() => expect(api.request).toHaveBeenCalledWith('/import/rows/suggested', { method: 'PATCH', body: { category_id: 'family-food', learn_rule: true, subcategory: null } }));
    expect(api.reconcileAll).not.toHaveBeenCalled();
  });

  it('salva escolha manual sem aprender por padrão e preserva rascunhos após erro', async () => {
    api.request.mockRejectedValueOnce(new Error('Não foi possível salvar a categoria.'));
    renderReview();
    fireEvent.change(await screen.findByLabelText('Categoria de Movimento suggested'), { target: { value: 'groceries' } });
    fireEvent.click(reviewRow('Movimento suggested').getByRole('button', { name: 'Salvar categoria' }));
    await screen.findByText('Não foi possível salvar a categoria.');
    expect(api.request).toHaveBeenCalledWith('/import/rows/suggested', { method: 'PATCH', body: { category_id: 'groceries', learn_rule: false, subcategory: null } });
    expect(screen.getByLabelText('Categoria de Movimento suggested').value).toBe('groceries');
    expect(screen.getByLabelText('Lembrar para próximos extratos de Movimento suggested').checked).toBe(false);
    expect(screen.getByRole('button', { name: /Usar 1 sugestão desta página/ }).disabled).toBe(true);
  });

  it('não ensina a categoria de transferência mesmo quando o backend envia learn_rule ativo', async () => {
    reviewRows = [row('transfer', { economic_kind: 'transfer', type: 'transfer', linked_transaction_id: 'counterpart', learn_rule: true, category_suggestion: null })];
    renderReview();
    const category = await screen.findByLabelText('Categoria de Movimento transfer');
    const remember = screen.getByLabelText('Lembrar para próximos extratos de Movimento transfer');
    expect(remember.disabled).toBe(true);
    expect(remember.checked).toBe(false);
    expect(screen.getByText('Aprendizado só para receitas e despesas conferidas.')).toBeTruthy();
    fireEvent.change(category, { target: { value: 'family-food' } });
    fireEvent.click(reviewRow('Movimento transfer').getByRole('button', { name: 'Salvar categoria' }));
    await waitFor(() => expect(api.request).toHaveBeenCalledWith('/import/rows/transfer', { method: 'PATCH', body: { category_id: 'family-food', learn_rule: false, subcategory: null } }));
    expect(api.reconcileAll).not.toHaveBeenCalled();
  });

  it('mantém categoria manual divergente visível e abstém em Pix entre pessoas', async () => {
    reviewRows = [
      row('manual', { category_id: 'salary' }),
      row('pix', { description: 'Pix recebido de pessoa fixture', amount_cents: 30000, category_suggestion: { category_id: null, confidence: 0, source: 'none', reason: 'Pix entre pessoas precisa de conferência.', nature_hint: { economic_kind: 'unknown', reason: 'Pode ser uma movimentação entre contas ou familiares.' } } }),
    ];
    renderReview();
    const current = await screen.findByLabelText('Categoria de Movimento manual');
    expect(current.value).toBe('salary');
    expect(within(current).getByRole('option', { name: 'Salário (categoria atual)' })).toBeTruthy();
    expect(reviewRow('Movimento manual').queryByText(/Sugestão:/)).toBeNull();
    expect(screen.getByText(/A categoria atual foi preservada/)).toBeTruthy();
    const pix = reviewRow('Pix recebido de pessoa fixture');
    expect(pix.getByText(/Sem sugestão segura.*Pix entre pessoas precisa de conferência/)).toBeTruthy();
    expect(pix.getByText(/A natureza exige conferência/)).toBeTruthy();
    expect(pix.queryByRole('button', { name: 'Usar sugestão' })).toBeNull();
    expect(pix.getByLabelText('Natureza de Pix recebido de pessoa fixture').value).toBe('standard');
    expect(api.request).not.toHaveBeenCalled();
  });
});

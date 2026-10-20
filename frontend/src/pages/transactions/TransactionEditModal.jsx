import api from '../../services/api';
import { signedAmount } from '../../utils/finance';
import { useState, useEffect } from 'react';
import BottomSheet from '../../components/ui/BottomSheet';
import InlineCategorySelect from '../../components/ui/InlineCategorySelect';
import { Trash2 } from 'lucide-react';

export default function TransactionEditModal({
  isOpen,
  onClose,
  transaction,
  categories,
  accounts,
  family,
  onSave,
  onDelete,
  onCategoryCreated
}) {
  const [form, setForm] = useState({
    description: '',
    amount: '',
    date: '',
    type: 'expense',
    category_id: '',
    subcategory: '',
    account_id: '',
    member_id: '', economic_kind: 'standard', reversal_of: ''
  });
  const [refunds, setRefunds] = useState([]);
  const [refundError, setRefundError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (transaction) {
      setForm({
        description: transaction.description || '',
        amount: Math.abs(transaction.amount || 0).toString(),
        date: transaction.date || '',
        type: transaction.type || 'expense',
        category_id: transaction.category_id || '',
        subcategory: transaction.subcategory || '',
        account_id: transaction.account_id || '',
        member_id: transaction.member_id || '',
        economic_kind: transaction.economic_kind || 'standard', reversal_of: transaction.reversal_of || ''
      });
    }
  }, [transaction]);

  useEffect(() => {
    if (!isOpen || form.economic_kind !== 'refund' || !form.account_id) return;
    let active = true;
    const load = async () => {
      try {
        const rows = []; let page = 1; let totalPages = 1;
        do { const result = await api.getTransactions({ account_id: form.account_id, page, limit: 500 }); rows.push(...result.transactions); totalPages = result.totalPages; page++; } while (page <= totalPages);
        if (active) { setRefunds(rows.filter(row => row.id !== transaction?.id && !row.linked_transaction_id && (row.economic_kind || 'standard') === 'standard')); setRefundError(null); }
      } catch (error) { if (active) setRefundError(error.message); }
    };
    void load(); return () => { active = false; };
  }, [isOpen, form.economic_kind, form.account_id, transaction?.id]);

  if (!transaction) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    // Formatting payload
    const payload = {
      description: form.description,
      amount: signedAmount(form.amount, form.type, transaction.amount),
      date: form.date,
      type: form.type,
      category_id: form.category_id || null,
      subcategory: form.subcategory || null,
      account_id: form.account_id || null,
      member_id: form.member_id || null,
      economic_kind: form.economic_kind, reversal_of: form.economic_kind === 'refund' ? form.reversal_of || null : null
    };

    try { await onSave(transaction.id, payload); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm(transaction.linked_transaction_id ? 'Anular as duas pernas desta movimentação? O histórico será preservado.' : 'Anular este lançamento? O histórico será preservado.')) return;
    setSaving(true);
    try { await onDelete(transaction.id); } finally { setSaving(false); }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Editar Lançamento">
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingBottom: '1rem' }}>

          <div className="grid grid-2" style={{ gap: '1rem' }}>
            <div className="form-group">
              <label>Data</label>
              <input aria-label="Data" disabled={Boolean(transaction.linked_transaction_id)} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Valor (R$)</label>
              <input
                aria-label="Valor (R$)" disabled={Boolean(transaction.linked_transaction_id)} type="number"
                step="0.01"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>Descrição</label>
            <input
              aria-label="Descrição" type="text"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-2" style={{ gap: '1rem' }}>
            <div className="form-group">
              <label>Categoria</label>
              <InlineCategorySelect
                categories={categories}
                value={form.category_id}
                onChange={(val) => setForm({ ...form, category_id: val, subcategory: '' })}
                typeFilter={form.type}
                onCategoryCreated={onCategoryCreated}
              />
            </div>
            <div className="form-group">
              <label>Subcategoria</label>
              <select
                value={form.subcategory || ''}
                onChange={e => setForm({ ...form, subcategory: e.target.value })}
                disabled={!form.category_id}
              >
                <option value="">- Nenhuma -</option>
                {categories.find(c => c.id === form.category_id)?.subcategories?.map(sub => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-2" style={{ gap: '1rem' }}>
            <div className="form-group">
              <label>Tipo</label>
              <select aria-label="Tipo" disabled={Boolean(transaction.linked_transaction_id)} value={form.type} onChange={e => setForm({ ...form, type: e.target.value, category_id: '' })}>
                <option value="income">Receita (+)</option>
                <option value="expense">Despesa (-)</option>
                <option value="transfer" disabled={!transaction.linked_transaction_id}>Transferência (use pareamento)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-2" style={{ gap: '1rem' }}>
            <div className="form-group">
              <label>Conta Associada</label>
              <select required aria-label="Conta associada" disabled={Boolean(transaction.linked_transaction_id)} value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })}>
                <option value="">Selecione a conta</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Membro / Responsável</label>
              <select value={form.member_id} onChange={e => setForm({ ...form, member_id: e.target.value })}>
                <option value="">Eu (Titular)</option>
                {family.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          </div>

          {!transaction.linked_transaction_id && <p>Para transferências importadas sem vínculo, revise o lançamento com a direção do valor e natureza padrão, depois pareie a saída com a entrada em Lançamentos. A exclusão de receita/despesa só ocorre após vincular a contraparte.</p>}
          <label>Natureza econômica<select aria-label="Natureza econômica" disabled={Boolean(transaction.linked_transaction_id)} value={form.economic_kind} onChange={e => setForm({ ...form, economic_kind: e.target.value, reversal_of: '' })}><option value="standard">Receita / despesa pelo sinal</option><option value="refund">Estorno / reembolso</option><option value="loan_principal">Principal de empréstimo</option><option value="owner_contribution">Aporte</option><option value="owner_withdrawal">Retirada</option><option value="transfer" disabled>Transferência vinculada</option><option value="card_payment" disabled>Pagamento de cartão vinculado</option><option value="investment_principal" disabled>Aplicação / resgate vinculado</option></select></label>
          {form.economic_kind === 'refund' && <label>Lançamento original do estorno<select required aria-label="Lançamento original do estorno" value={form.reversal_of} onChange={e => setForm({ ...form, reversal_of: e.target.value })}><option value="">Selecione o movimento original</option>{refunds.map(row => <option key={row.id} value={row.id}>{row.date} · {row.description} · {row.amount}</option>)}</select>{refundError && <span role="alert">{refundError}</span>}</label>}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '0 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={handleDelete}
              disabled={saving}
              title="Excluir lançamentos"
            >
              <Trash2 size={16} color="var(--color-danger)" />
            </button>
            <button type="button" className="btn btn-secondary flex-1" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className="btn btn-primary flex-1" disabled={saving}>💾 Salvar</button>
          </div>
        </div>
      </form>
    </BottomSheet>
  );
}

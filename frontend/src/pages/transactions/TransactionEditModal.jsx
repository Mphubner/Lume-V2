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
    member_id: ''
  });
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
        member_id: transaction.member_id || ''
      });
    }
  }, [transaction]);

  if (!transaction) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    // Formatting payload
    const payload = {
      description: form.description,
      amount: form.type === 'expense' ? -Math.abs(parseFloat(form.amount)) : Math.abs(parseFloat(form.amount)),
      date: form.date,
      type: form.type,
      category_id: form.category_id || null,
      subcategory: form.subcategory || null,
      account_id: form.account_id || null,
      member_id: form.member_id || null
    };

    await onSave(transaction.id, payload);
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!window.confirm('Tem certeza que deseja excluir esta transação permanentemente?')) return;
    setSaving(true);
    await onDelete(transaction.id);
    setSaving(false);
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Editar Lançamento">
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingBottom: '1rem' }}>
          
          <div className="grid grid-2" style={{ gap: '1rem' }}>
            <div className="form-group">
              <label>Data</label>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Valor (R$)</label>
              <input 
                type="number" 
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
              type="text" 
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
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value, category_id: '' })}>
                <option value="income">Receita (+)</option>
                <option value="expense">Despesa (-)</option>
                <option value="transfer">Transferência</option>
              </select>
            </div>
          </div>

          <div className="grid grid-2" style={{ gap: '1rem' }}>
            <div className="form-group">
              <label>Conta Associada</label>
              <select value={form.account_id} onChange={e => setForm({ ...form, account_id: e.target.value })}>
                <option value="">Nenhuma / Automática</option>
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

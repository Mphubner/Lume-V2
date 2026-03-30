import { useState, useEffect } from 'react';
import api from '../../services/api';
import StatCard from '../../components/ui/StatCard';
import InlineCategorySelect from '../../components/ui/InlineCategorySelect';
import { formatCurrency } from '../../utils/format';
import { Plus, Edit3, Trash2, Receipt, CheckCircle, Clock, AlertTriangle } from 'lucide-react';

const RECURRENCE_LABELS = { weekly: 'Semanal', biweekly: 'Quinzenal', monthly: 'Mensal', quarterly: 'Trimestral', yearly: 'Anual' };

export default function RecurringPage() {
  const [bills, setBills] = useState([]);
  const [stats, setStats] = useState({ totalMonthly: 0, overdue: 0 });
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingBill, setEditingBill] = useState(null);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    name: '', amount: '', due_day: '', category_id: '', recurrence: 'monthly', is_auto_debit: false, description: '', adjust_to_business_day: true, status: 'active',
  });

  useEffect(() => { loadBills(); loadCategories(); }, []);

  const loadBills = async () => {
    setLoading(true);
    try {
      const result = await api.getRecurringBills();
      setBills(result.bills || []);
      setStats(result.stats || stats);
    } catch {
      setBills([
        { id: '1', name: 'Aluguel', amount: 1800, due_day: 5, categories: { name: 'Moradia', icon: '🏠', color: '#8b5cf6' }, recurrence: 'monthly', is_auto_debit: false, status: 'active' },
        { id: '2', name: 'Energia', amount: 180, due_day: 10, categories: { name: 'Contas e Serviços', icon: '📋', color: '#64748b' }, recurrence: 'monthly', is_auto_debit: true, status: 'active' },
        { id: '3', name: 'Internet', amount: 120, due_day: 15, categories: { name: 'Contas e Serviços', icon: '📋', color: '#64748b' }, recurrence: 'monthly', is_auto_debit: true, status: 'active' },
        { id: '4', name: 'Streaming Netflix', amount: 44.90, due_day: 22, categories: { name: 'Lazer', icon: '🎮', color: '#ec4899' }, recurrence: 'monthly', is_auto_debit: true, status: 'active' },
        { id: '5', name: 'Spotify', amount: 21.90, due_day: 22, categories: { name: 'Lazer', icon: '🎮', color: '#ec4899' }, recurrence: 'monthly', is_auto_debit: true, status: 'active' },
        { id: '6', name: 'Academia', amount: 99, due_day: 1, categories: { name: 'Saúde', icon: '💊', color: '#ef4444' }, recurrence: 'monthly', is_auto_debit: false, status: 'active' },
        { id: '7', name: 'Seguro Carro', amount: 350, due_day: 20, categories: { name: 'Transporte', icon: '🚗', color: '#3b82f6' }, recurrence: 'monthly', is_auto_debit: false, status: 'active' },
      ]);
      setStats({ totalMonthly: 2615.80, overdue: 0 });
    } finally { setLoading(false); }
  };

  const loadCategories = async () => {
    try { const result = await api.getCategories(); setCategories(result || []); } catch {}
  };

  const currentDay = new Date().getDate();
  const activeBills = bills.filter(b => b.status === 'active');
  const paidBills = activeBills.filter(b => b.due_day < currentDay);
  const dueSoon = activeBills.filter(b => b.due_day >= currentDay && b.due_day <= currentDay + 7);
  const pending = activeBills.filter(b => b.due_day >= currentDay);

  const openCreate = () => {
    setEditingBill(null);
    setForm({ name: '', amount: '', due_day: '', category_id: '', recurrence: 'monthly', is_auto_debit: false, description: '', adjust_to_business_day: true, status: 'active' });
    setShowModal(true);
  };
  const openEdit = (bill) => {
    setEditingBill(bill);
    setForm({ name: bill.name, amount: String(bill.amount), due_day: String(bill.due_day), category_id: bill.category_id || '', recurrence: bill.recurrence, is_auto_debit: bill.is_auto_debit, description: bill.description || '', adjust_to_business_day: bill.adjust_to_business_day ?? true, status: bill.status });
    setShowModal(true);
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = { ...form, amount: parseFloat(form.amount), due_day: parseInt(form.due_day) };
      if (editingBill) await api.updateRecurringBill(editingBill.id, data);
      else await api.createRecurringBill(data);
      setShowModal(false); loadBills();
    } catch (err) { alert('Erro: ' + err.message); }
  };
  const handleDelete = async (id) => {
    if (!confirm('Excluir esta conta?')) return;
    try { await api.deleteRecurringBill(id); loadBills(); } catch {}
  };
  const toggleStatus = async (bill) => {
    try { await api.updateRecurringBill(bill.id, { status: bill.status === 'active' ? 'inactive' : 'active' }); loadBills(); } catch {}
  };

  const getDueStatus = (dueDay) => {
    if (dueDay < currentDay) return { label: 'Vencida', color: 'var(--color-success)', icon: <CheckCircle size={14} /> };
    if (dueDay <= currentDay + 3) return { label: 'Vence em breve', color: 'var(--color-warning)', icon: <AlertTriangle size={14} /> };
    return { label: `Dia ${dueDay}`, color: 'var(--text-muted)', icon: <Clock size={14} /> };
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div className="page-header" style={{ marginBottom: 0 }}><h1>Contas Fixas do Mês</h1><p>Controle suas despesas recorrentes e não perca prazos</p></div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Nova Conta Fixa</button>
      </div>

      {/* Stats */}
      <div className="grid grid-4" style={{ marginBottom: '1.5rem' }}>
        <StatCard label="Total Mensal" value={formatCurrency(activeBills.reduce((s, b) => s + parseFloat(b.amount), 0))} variant="balance" />
        <StatCard label="Pagas Este Mês" value={`${paidBills.length} / ${activeBills.length}`} sub={formatCurrency(paidBills.reduce((s, b) => s + parseFloat(b.amount), 0))} variant="income" />
        <StatCard label="Pendentes" value={String(pending.length)} sub={formatCurrency(pending.reduce((s, b) => s + parseFloat(b.amount), 0))} variant="savings" />
        <StatCard label="Vencem em 7 dias" value={String(dueSoon.length)} sub={dueSoon.length > 0 ? '⚠️ Atenção!' : '✅ Tudo OK'} variant={dueSoon.length > 0 ? 'expense' : 'neutral'} />
      </div>

      {loading ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : bills.length === 0 ? (
        <div className="card"><div className="empty-state">
          <div className="empty-state-icon"><Receipt size={48} /></div>
          <h3>Nenhuma conta fixa cadastrada</h3>
          <p>Cadastre aluguel, energia, internet, streaming e outras contas fixas</p>
          <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Adicionar</button>
        </div></div>
      ) : (
        <div className="card">
          <table className="data-table">
            <thead><tr>
              <th>Conta</th><th>Categoria</th><th>Vencimento</th><th>Recorrência</th><th>Valor</th><th>Status</th><th>Ações</th>
            </tr></thead>
            <tbody>
              {activeBills.sort((a, b) => a.due_day - b.due_day).map(bill => {
                const dueStatus = getDueStatus(bill.due_day);
                return (
                  <tr key={bill.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{bill.name}</div>
                      {bill.is_auto_debit && <span style={{ fontSize: '0.7rem', color: 'var(--accent-gold)' }}>🔄 Débito automático</span>}
                    </td>
                    <td><span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>{bill.categories?.icon} {bill.categories?.name || '-'}</span></td>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: dueStatus.color }}>
                        {dueStatus.icon} Dia {bill.due_day}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>{RECURRENCE_LABELS[bill.recurrence] || bill.recurrence}</td>
                    <td style={{ fontWeight: 700 }}>{formatCurrency(bill.amount)}</td>
                    <td>
                      <button onClick={() => toggleStatus(bill)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                        <span className={`badge ${bill.status === 'active' ? 'badge-success' : 'badge-info'}`}>
                          {bill.status === 'active' ? '✅ Ativa' : '⏸️ Pausa'}
                        </span>
                      </button>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button className="btn-icon" onClick={() => openEdit(bill)}><Edit3 size={14} /></button>
                        <button className="btn-icon" onClick={() => handleDelete(bill.id)}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingBill ? '✏️ Editar Conta Fixa' : '📋 Nova Conta Fixa'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: '1.25rem' }}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Nome *</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Aluguel, Energia, Spotify..." required />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Valor Mensal *</label>
                    <input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="350.00" required />
                  </div>
                  <div className="form-group">
                    <label>Dia do Vencimento *</label>
                    <input type="number" min="1" max="31" value={form.due_day} onChange={e => setForm({ ...form, due_day: e.target.value })} placeholder="10" required />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Categoria</label>
                    <InlineCategorySelect 
                      categories={categories}
                      value={form.category_id}
                      onChange={(val) => setForm({ ...form, category_id: val })}
                      typeFilter="expense"
                      onCategoryCreated={loadCategories}
                    />
                  </div>
                  <div className="form-group">
                    <label>Recorrência</label>
                    <select value={form.recurrence} onChange={e => setForm({ ...form, recurrence: e.target.value })}>
                      {Object.entries(RECURRENCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Descrição (opcional)</label>
                  <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Notas adicionais..." />
                </div>
                <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                    <input type="checkbox" checked={form.is_auto_debit} onChange={e => setForm({ ...form, is_auto_debit: e.target.checked })} />
                    🔄 Débito automático
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                    <input type="checkbox" checked={form.adjust_to_business_day} onChange={e => setForm({ ...form, adjust_to_business_day: e.target.checked })} />
                    📅 Ajustar para dia útil
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">💾 Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import api from '../../services/api';
import StatCard from '../../components/ui/StatCard';
import { formatCurrency, formatDate } from '../../utils/format';
import { Plus, Edit3, Trash2, TrendingDown, CheckCircle } from 'lucide-react';

const DEBT_TYPES = { personal_loan: 'Empréstimo Pessoal', financing: 'Financiamento', credit_card_debt: 'Dívida Cartão', overdraft: 'Cheque Especial', other: 'Outro' };
const DEBT_ICONS = { personal_loan: '💰', financing: '🏠', credit_card_debt: '💳', overdraft: '🏦', other: '📄' };

export default function DebtsPage() {
  const [debts, setDebts] = useState([]);
  const [debtStats, setDebtStats] = useState({ totalOwed: 0, totalPaid: 0, monthlyPayment: 0, activeCount: 0, paidCount: 0 });
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingDebt, setEditingDebt] = useState(null);
  const [showPayment, setShowPayment] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [form, setForm] = useState({
    name: '', type: 'personal_loan', creditor: '', original_amount: '', current_balance: '', interest_rate: '', total_installments: '', installment_amount: '', due_day: '', description: '',
  });

  useEffect(() => { loadDebts(); }, []);

  const loadDebts = async () => {
    setLoading(true);
    try {
      const result = await api.getDebts();
      setDebts(result.debts || []);
      setDebtStats(result.stats || debtStats);
    } catch {
      setDebts([
        { id: '1', name: 'Financiamento Carro', type: 'financing', creditor: 'Banco Itaú', original_amount: 45000, current_balance: 32000, interest_rate: 1.2, total_installments: 48, installment_amount: 1250, due_day: 15, status: 'active', start_date: '2024-06-01' },
        { id: '2', name: 'Empréstimo Pessoal', type: 'personal_loan', creditor: 'Nubank', original_amount: 8000, current_balance: 3500, interest_rate: 2.5, total_installments: 12, installment_amount: 750, due_day: 10, status: 'active', start_date: '2025-08-15' },
        { id: '3', name: 'Dívida Cartão Visa', type: 'credit_card_debt', creditor: 'Bradesco', original_amount: 3200, current_balance: 0, interest_rate: 12, total_installments: 0, installment_amount: 0, due_day: 5, status: 'paid', start_date: '2025-01-10' },
      ]);
      setDebtStats({ totalOwed: 35500, totalPaid: 3200, monthlyPayment: 2000, activeCount: 2, paidCount: 1 });
    } finally { setLoading(false); }
  };

  const openCreate = () => {
    setEditingDebt(null);
    setForm({ name: '', type: 'personal_loan', creditor: '', original_amount: '', current_balance: '', interest_rate: '', total_installments: '', installment_amount: '', due_day: '', description: '' });
    setShowModal(true);
  };
  const openEdit = (debt) => {
    setEditingDebt(debt);
    setForm({ name: debt.name, type: debt.type, creditor: debt.creditor, original_amount: String(debt.original_amount), current_balance: String(debt.current_balance), interest_rate: String(debt.interest_rate || ''), total_installments: String(debt.total_installments || ''), installment_amount: String(debt.installment_amount || ''), due_day: String(debt.due_day || ''), description: debt.description || '' });
    setShowModal(true);
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = { ...form, original_amount: parseFloat(form.original_amount), current_balance: parseFloat(form.current_balance || form.original_amount), interest_rate: parseFloat(form.interest_rate || 0), total_installments: parseInt(form.total_installments || 0), installment_amount: parseFloat(form.installment_amount || 0), due_day: parseInt(form.due_day || 1) };
      if (editingDebt) await api.updateDebt(editingDebt.id, data);
      else await api.createDebt(data);
      setShowModal(false); loadDebts();
    } catch (err) { alert('Erro: ' + err.message); }
  };
  const handleDelete = async (id) => {
    if (!confirm('Excluir esta pendência?')) return;
    try { await api.deleteDebt(id); loadDebts(); } catch {}
  };
  const handlePayment = async (debt) => {
    const val = parseFloat(paymentAmount);
    if (!val || val <= 0) return;
    const newBalance = Math.max(0, parseFloat(debt.current_balance) - val);
    try {
      await api.updateDebt(debt.id, { current_balance: newBalance, status: newBalance <= 0 ? 'paid' : 'active' });
      setShowPayment(null);
      setPaymentAmount('');
      loadDebts();
    } catch (err) { alert('Erro: ' + err.message); }
  };
  const markAsPaid = async (debt) => {
    if (!confirm('Marcar como quitada?')) return;
    try { await api.updateDebt(debt.id, { current_balance: 0, status: 'paid' }); loadDebts(); } catch {}
  };

  const getProgressPct = (debt) => {
    const paid = parseFloat(debt.original_amount) - parseFloat(debt.current_balance);
    return Math.max(0, Math.min(100, (paid / parseFloat(debt.original_amount)) * 100));
  };

  const activeDebts = debts.filter(d => d.status === 'active');
  const paidDebts = debts.filter(d => d.status === 'paid');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div className="page-header" style={{ marginBottom: 0 }}><h1>Minhas Pendências</h1><p>Acompanhe, pague e quite suas dívidas com estratégias inteligentes</p></div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Nova Pendência</button>
      </div>

      <div className="grid grid-4" style={{ marginBottom: '1.5rem' }}>
        <StatCard label="Total Devido" value={formatCurrency(debtStats.totalOwed)} variant="expense" />
        <StatCard label="Já Quitado" value={formatCurrency(debtStats.totalPaid)} sub={`${debtStats.paidCount} quitadas`} variant="income" />
        <StatCard label="Parcela Mensal" value={formatCurrency(debtStats.monthlyPayment)} variant="savings" />
        <StatCard label="Pendências Ativas" value={String(debtStats.activeCount)} sub={`${debtStats.paidCount} quitadas`} variant="neutral" />
      </div>

      {loading ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : debts.length === 0 ? (
        <div className="card"><div className="empty-state">
          <div className="empty-state-icon">🎉</div>
          <h3>Sem pendências! Parabéns! 🎉</h3>
          <p>Você não possui dívidas cadastradas no momento. Continue assim!</p>
        </div></div>
      ) : (
        <>
          {/* Active Debts */}
          {activeDebts.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-secondary)' }}>⚠️ Pendências Ativas ({activeDebts.length})</h3>
              <div className="grid grid-2">
                {activeDebts.map(debt => {
                  const progress = getProgressPct(debt);
                  const paid = parseFloat(debt.original_amount) - parseFloat(debt.current_balance);
                  return (
                    <div key={debt.id} className="card" style={{ borderLeft: `4px solid var(--color-danger)` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ fontSize: '1.5rem' }}>{DEBT_ICONS[debt.type]}</span>
                          <div>
                            <div style={{ fontWeight: 600 }}>{debt.name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{debt.creditor} • {DEBT_TYPES[debt.type]}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button className="btn-icon" onClick={() => openEdit(debt)}><Edit3 size={14} /></button>
                          <button className="btn-icon" onClick={() => handleDelete(debt.id)}><Trash2 size={14} /></button>
                        </div>
                      </div>

                      <div className="grid grid-3" style={{ gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Saldo Devedor</div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-danger)' }}>{formatCurrency(debt.current_balance)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Parcela</div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{formatCurrency(debt.installment_amount)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Juros</div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-warning)' }}>{debt.interest_rate}% a.m.</div>
                        </div>
                      </div>

                      <div style={{ marginBottom: '0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatCurrency(paid)} pago</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{progress.toFixed(0)}%</span>
                        </div>
                        <div style={{ height: 8, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${progress}%`, background: 'var(--color-success)', borderRadius: 4, transition: 'width 0.5s' }} />
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {showPayment === debt.id ? (
                          <div style={{ display: 'flex', gap: '0.5rem', flex: 1, alignItems: 'center' }}>
                            <input type="number" step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="R$ valor" style={{ flex: 1, padding: '0.375rem 0.5rem', fontSize: '0.8rem' }} />
                            <button className="btn btn-primary btn-sm" onClick={() => handlePayment(debt)}>Pagar</button>
                            <button className="btn-icon" onClick={() => setShowPayment(null)}>✕</button>
                          </div>
                        ) : (
                          <>
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowPayment(debt.id)}><TrendingDown size={14} /> Registrar Pagamento</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => markAsPaid(debt)}><CheckCircle size={14} /> Quitar</button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Paid Debts */}
          {paidDebts.length > 0 && (
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-secondary)' }}>🎉 Pendências Quitadas ({paidDebts.length})</h3>
              <div className="grid grid-3">
                {paidDebts.map(debt => (
                  <div key={debt.id} className="card" style={{ opacity: 0.6, borderLeft: '4px solid var(--color-success)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: '1.25rem' }}>{DEBT_ICONS[debt.type]}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{debt.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-success)' }}>✅ Quitada</div>
                      </div>
                      <span style={{ fontWeight: 700, color: 'var(--color-success)', fontSize: '0.9rem' }}>{formatCurrency(debt.original_amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h2>{editingDebt ? '✏️ Editar Pendência' : '📋 Nova Pendência'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: '1.25rem' }}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Nome *</label>
                    <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Financiamento, Empréstimo..." required />
                  </div>
                  <div className="form-group">
                    <label>Tipo</label>
                    <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                      {Object.entries(DEBT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Credor *</label>
                  <input value={form.creditor} onChange={e => setForm({ ...form, creditor: e.target.value })} placeholder="Banco, Financeira..." required />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Valor Original (R$) *</label>
                    <input type="number" step="0.01" value={form.original_amount} onChange={e => setForm({ ...form, original_amount: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>Saldo Atual (R$)</label>
                    <input type="number" step="0.01" value={form.current_balance} onChange={e => setForm({ ...form, current_balance: e.target.value })} placeholder="Igual ao original se novo" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Juros (% ao mês)</label>
                    <input type="number" step="0.01" value={form.interest_rate} onChange={e => setForm({ ...form, interest_rate: e.target.value })} placeholder="1.5" />
                  </div>
                  <div className="form-group">
                    <label>Total de Parcelas</label>
                    <input type="number" value={form.total_installments} onChange={e => setForm({ ...form, total_installments: e.target.value })} placeholder="48" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Valor da Parcela (R$)</label>
                    <input type="number" step="0.01" value={form.installment_amount} onChange={e => setForm({ ...form, installment_amount: e.target.value })} placeholder="1250" />
                  </div>
                  <div className="form-group">
                    <label>Dia Vencimento</label>
                    <input type="number" min="1" max="31" value={form.due_day} onChange={e => setForm({ ...form, due_day: e.target.value })} placeholder="15" />
                  </div>
                </div>
                <div className="form-group">
                  <label>Observações</label>
                  <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Notas adicionais..." />
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

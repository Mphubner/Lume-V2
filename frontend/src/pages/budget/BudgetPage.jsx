import { useState, useEffect } from 'react';
import api from '../../services/api';
import StatCard from '../../components/ui/StatCard';
import { formatCurrency, getMonthName } from '../../utils/format';
import { Sparkles, Plus, Trash2, ChevronLeft, ChevronRight, RefreshCw, AlertTriangle } from 'lucide-react';

export default function BudgetPage() {
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [showModal, setShowModal] = useState(false);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ category_id: '', planned_amount: '' });
  const [aiSuggestion, setAiSuggestion] = useState(null);

  useEffect(() => { loadBudgets(); loadCategories(); }, [month, year]);

  const loadBudgets = async () => {
    setLoading(true);
    try {
      const result = await api.getBudgets({ month, year });
      setBudgets(result || []);
    } catch {
      // Sem dados demo — mostra empty state
      setBudgets([]);
    } finally { setLoading(false); }
  };

  const loadCategories = async () => {
    try { const result = await api.getCategories(); setCategories(result || []); } catch {}
  };

  const totalPlanned = budgets.reduce((s, b) => s + parseFloat(b.planned_amount), 0);
  const totalSpent = budgets.reduce((s, b) => s + parseFloat(b.spent_amount || 0), 0);
  const overBudget = budgets.filter(b => parseFloat(b.spent_amount || 0) > parseFloat(b.planned_amount));
  const underBudget = budgets.filter(b => parseFloat(b.spent_amount || 0) <= parseFloat(b.planned_amount));

  const generateWithAI = async () => {
    setAiLoading(true);
    try {
      const result = await api.generateBudget({ month, year });
      setAiSuggestion(result);
    } catch {
      // Sem sugestão demo
      setAiSuggestion(null);
    } finally { setAiLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.request('/budgets', { method: 'POST', body: { ...form, month, year, planned_amount: parseFloat(form.planned_amount) } });
      setShowModal(false);
      setForm({ category_id: '', planned_amount: '' });
      loadBudgets();
    } catch (err) { alert('Erro: ' + err.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remover este orçamento?')) return;
    try { await api.request(`/budgets/${id}`, { method: 'DELETE' }); loadBudgets(); } catch {}
  };

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1); };

  const getProgressPct = (b) => {
    const pct = (parseFloat(b.spent_amount || 0) / parseFloat(b.planned_amount)) * 100;
    return Math.min(100, pct);
  };
  const getProgressColor = (b) => {
    const pct = getProgressPct(b);
    if (pct >= 100) return 'var(--color-danger)';
    if (pct >= 80) return 'var(--color-warning)';
    return 'var(--color-success)';
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Meu Plano do Mês</h1>
          <p>Planejamento e controle de gastos por categoria</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> Adicionar Limite</button>
          <button className="btn btn-secondary" onClick={generateWithAI} disabled={aiLoading}>
            <Sparkles size={16} /> {aiLoading ? 'Gerando...' : 'Gerar com IA'}
          </button>
        </div>
      </div>

      {/* Month Navigation */}
      <div className="date-nav">
        <button onClick={prevMonth}><ChevronLeft size={20} /></button>
        <h3>📅 {getMonthName(month, year)}</h3>
        <button onClick={nextMonth}><ChevronRight size={20} /></button>
      </div>

      {/* Stats */}
      <div className="grid grid-4" style={{ marginBottom: '1.5rem' }}>
        <StatCard label="Planejado Total" value={formatCurrency(totalPlanned)} variant="balance" />
        <StatCard label="Gasto Atual" value={formatCurrency(totalSpent)} variant={totalSpent > totalPlanned ? 'expense' : 'income'} />
        <StatCard label="Disponível" value={formatCurrency(Math.max(0, totalPlanned - totalSpent))} variant="savings" />
        <StatCard label="Categorias Excedidas" value={String(overBudget.length)} sub={overBudget.length > 0 ? '⚠️ Atenção!' : '✅ Tudo OK'} variant="neutral" />
      </div>

      {/* AI Suggestion Panel */}
      {aiSuggestion && (
        <div className="card" style={{ marginBottom: '1.5rem', borderColor: 'var(--accent-purple)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <Sparkles size={20} style={{ color: 'var(--accent-purple)' }} />
            <div>
              <div style={{ fontWeight: 600, color: 'var(--accent-purple)' }}>Sugestão da IA</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Baseado nos seus gastos dos últimos 3 meses</div>
            </div>
            <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setAiSuggestion(null)}>Fechar</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
            {aiSuggestion.budgets.map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--border-radius-sm)' }}>
                <span style={{ fontWeight: 600, flex: 1 }}>{b.category}</span>
                <span style={{ fontWeight: 700, color: 'var(--accent-gold)' }}>{formatCurrency(b.planned_amount)}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: 300 }}>{b.reasoning}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.5rem' }}>💡 Dicas:</div>
          {aiSuggestion.tips?.map((tip, i) => (
            <div key={i} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', paddingLeft: '1rem', marginBottom: '0.25rem' }}>• {tip}</div>
          ))}
        </div>
      )}

      {/* Budget Cards */}
      {loading ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : budgets.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📊</div>
            <h3>Crie seu Plano do Mês</h3>
            <p>Defina limites por categoria ou deixe a IA sugerir baseado nos seus gastos</p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> Manual</button>
              <button className="btn btn-secondary" onClick={generateWithAI}><Sparkles size={16} /> Gerar com IA</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-2">
          {budgets.map(b => {
            const isOver = parseFloat(b.spent_amount || 0) > parseFloat(b.planned_amount);
            return (
              <div key={b.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>{b.categories?.icon || '📦'}</span>
                    <div>
                      <div style={{ fontWeight: 600 }}>{b.categories?.name || 'Categoria'}</div>
                      {isOver && <div style={{ fontSize: '0.75rem', color: 'var(--color-danger)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><AlertTriangle size={12} /> Excedeu o limite!</div>}
                    </div>
                  </div>
                  <button className="btn-icon" onClick={() => handleDelete(b.id)}><Trash2 size={14} /></button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Gasto: <strong style={{ color: isOver ? 'var(--color-danger)' : 'var(--text-primary)' }}>{formatCurrency(b.spent_amount || 0)}</strong></span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Limite: <strong>{formatCurrency(b.planned_amount)}</strong></span>
                </div>

                <div style={{ height: 10, background: 'var(--bg-secondary)', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${getProgressPct(b)}%`, background: getProgressColor(b), borderRadius: 5, transition: 'width 0.5s' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{getProgressPct(b).toFixed(0)}% utilizado</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isOver ? 'var(--color-danger)' : 'var(--color-success)' }}>
                    {isOver ? `- ${formatCurrency(parseFloat(b.spent_amount) - parseFloat(b.planned_amount))}` : `${formatCurrency(parseFloat(b.planned_amount) - parseFloat(b.spent_amount || 0))} restante`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Budget Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📊 Novo Limite de Categoria</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: '1.25rem' }}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Categoria</label>
                  <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })} required>
                    <option value="">Selecione...</option>
                    {categories.filter(c => c.type === 'expense' || c.type === 'both').map(c => (
                      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Limite Mensal (R$)</label>
                  <input type="number" step="0.01" value={form.planned_amount} onChange={e => setForm({ ...form, planned_amount: e.target.value })} placeholder="800.00" required />
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

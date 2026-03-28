import { useState, useEffect } from 'react';
import api from '../../services/api';
import StatCard from '../../components/ui/StatCard';
import { formatCurrency, formatDate } from '../../utils/format';
import { Target, Plus, Edit3, Trash2, X, ChevronDown, ChevronUp } from 'lucide-react';

const GOAL_ICONS = ['🎯', '🏠', '🚗', '✈️', '📚', '💻', '🎓', '💍', '👶', '📱', '💰', '🏖️', '🏋️', '🎸'];

export default function GoalsPage() {
  const [goals, setGoals] = useState([]);
  const [stats, setStats] = useState({ activeCount: 0, totalSaved: 0, totalTarget: 0, avgProgress: 0 });
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [showContribute, setShowContribute] = useState(null);
  const [contribution, setContribution] = useState('');
  const [form, setForm] = useState({
    name: '', target_amount: '', current_amount: '0', deadline: '', icon: '🎯', color: '#d4a843', status: 'active',
  });

  useEffect(() => { loadGoals(); }, []);

  const loadGoals = async () => {
    setLoading(true);
    try {
      const result = await api.getGoals();
      setGoals(result.goals || []);
      setStats(result.stats || stats);
    } catch {
      // Sem dados demo — mostra empty state
      setGoals([]);
      setStats({ activeCount: 0, totalSaved: 0, totalTarget: 0, avgProgress: 0 });
    } finally { setLoading(false); }
  };

  const openCreate = () => {
    setEditingGoal(null);
    setForm({ name: '', target_amount: '', current_amount: '0', deadline: '', icon: '🎯', color: '#d4a843', status: 'active' });
    setShowModal(true);
  };

  const openEdit = (goal) => {
    setEditingGoal(goal);
    setForm({
      name: goal.name,
      target_amount: String(goal.target_amount),
      current_amount: String(goal.current_amount),
      deadline: goal.deadline || '',
      icon: goal.icon || '🎯',
      color: goal.color || '#d4a843',
      status: goal.status,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = { ...form, target_amount: parseFloat(form.target_amount), current_amount: parseFloat(form.current_amount || 0) };
      if (editingGoal) {
        await api.updateGoal(editingGoal.id, data);
      } else {
        await api.createGoal(data);
      }
      setShowModal(false);
      loadGoals();
    } catch (err) { alert('Erro: ' + err.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Excluir esta meta?')) return;
    try { await api.deleteGoal(id); loadGoals(); } catch (err) { alert('Erro: ' + err.message); }
  };

  const handleContribute = async (goal) => {
    const amount = parseFloat(contribution);
    if (!amount || amount <= 0) return;
    try {
      await api.updateGoal(goal.id, {
        current_amount: parseFloat(goal.current_amount) + amount,
        status: parseFloat(goal.current_amount) + amount >= parseFloat(goal.target_amount) ? 'completed' : 'active',
      });
      setShowContribute(null);
      setContribution('');
      loadGoals();
    } catch (err) { alert('Erro: ' + err.message); }
  };

  const getProgress = (goal) => {
    const pct = (parseFloat(goal.current_amount) / parseFloat(goal.target_amount)) * 100;
    return Math.min(100, pct).toFixed(1);
  };

  const getDaysLeft = (deadline) => {
    if (!deadline) return null;
    const diff = Math.ceil((new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const activeGoals = goals.filter(g => g.status === 'active');
  const completedGoals = goals.filter(g => g.status === 'completed');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Metas Financeiras</h1>
          <p>Defina e acompanhe seus objetivos financeiros</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Nova Meta</button>
      </div>

      {/* Stats */}
      <div className="grid grid-4" style={{ marginBottom: '1.5rem' }}>
        <StatCard label="🎯 Metas Ativas" value={String(stats.activeCount)} sub="em andamento" variant="neutral" />
        <StatCard label="📈 Total Acumulado" value={formatCurrency(stats.totalSaved)} sub="guardado até agora" variant="income" />
        <StatCard label="✨ Meta Total" value={formatCurrency(stats.totalTarget)} sub="objetivo final" variant="balance" />
        <StatCard label="✅ Progresso Médio" value={`${stats.avgProgress.toFixed(0)}%`} sub="continue economizando" variant="savings" />
      </div>

      {loading ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : goals.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">🎯</div>
            <h3>Defina suas metas financeiras</h3>
            <p>Crie metas para viagens, compras, investimentos e mais. Acompanhe o progresso visualmente.</p>
            <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Criar Primeira Meta</button>
          </div>
        </div>
      ) : (
        <>
          {/* Active Goals */}
          {activeGoals.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-secondary)' }}>🎯 Metas Ativas ({activeGoals.length})</h3>
              <div className="grid grid-2">
                {activeGoals.map(goal => {
                  const progress = getProgress(goal);
                  const daysLeft = getDaysLeft(goal.deadline);
                  return (
                    <div key={goal.id} className="card" style={{ borderLeft: `4px solid ${goal.color || 'var(--accent-gold)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{ fontSize: '1.5rem' }}>{goal.icon}</span>
                          <div>
                            <div style={{ fontWeight: 600 }}>{goal.name}</div>
                            {daysLeft !== null && (
                              <div style={{ fontSize: '0.75rem', color: daysLeft < 30 ? 'var(--color-danger)' : 'var(--text-muted)' }}>
                                {daysLeft > 0 ? `${daysLeft} dias restantes` : 'Prazo expirado'}
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button className="btn-icon" onClick={() => openEdit(goal)}><Edit3 size={14} /></button>
                          <button className="btn-icon" onClick={() => handleDelete(goal.id)}><Trash2 size={14} /></button>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '1.25rem', fontWeight: 700, color: goal.color }}>{formatCurrency(goal.current_amount)}</span>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>de {formatCurrency(goal.target_amount)}</span>
                      </div>

                      <div style={{ height: 8, background: 'var(--bg-secondary)', borderRadius: 4, marginBottom: '0.75rem', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${progress}%`, background: goal.color || 'var(--accent-gold)', borderRadius: 4, transition: 'width 0.5s ease' }} />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{progress}% concluído</span>
                        {showContribute === goal.id ? (
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <input type="number" step="0.01" placeholder="R$ 0,00" value={contribution} onChange={e => setContribution(e.target.value)} style={{ width: 120, padding: '0.375rem 0.5rem', fontSize: '0.8rem' }} />
                            <button className="btn btn-primary btn-sm" onClick={() => handleContribute(goal)}>+</button>
                            <button className="btn-icon" onClick={() => { setShowContribute(null); setContribution(''); }}><X size={14} /></button>
                          </div>
                        ) : (
                          <button className="btn btn-secondary btn-sm" onClick={() => setShowContribute(goal.id)}><Plus size={14} /> Contribuir</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Completed Goals */}
          {completedGoals.length > 0 && (
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-secondary)' }}>🎉 Metas Concluídas ({completedGoals.length})</h3>
              <div className="grid grid-3">
                {completedGoals.map(goal => (
                  <div key={goal.id} className="card" style={{ opacity: 0.7 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '1.25rem' }}>{goal.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{goal.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-success)' }}>✅ Concluída</div>
                      </div>
                      <span style={{ fontWeight: 700, color: 'var(--color-success)' }}>{formatCurrency(goal.target_amount)}</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--bg-secondary)', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: '100%', background: 'var(--color-success)', borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingGoal ? '✏️ Editar Meta' : '🎯 Nova Meta'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: '1.25rem' }}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Ícone</label>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {GOAL_ICONS.map(icon => (
                      <button key={icon} type="button" onClick={() => setForm({ ...form, icon })} style={{
                        fontSize: '1.5rem', padding: '0.5rem', borderRadius: 8, cursor: 'pointer',
                        background: form.icon === icon ? 'var(--accent-gold-dim)' : 'var(--bg-secondary)',
                        border: form.icon === icon ? '2px solid var(--accent-gold)' : '2px solid transparent',
                      }}>{icon}</button>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label>Nome da Meta *</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Viagem, Carro novo..." required />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Valor Alvo (R$) *</label>
                    <input type="number" step="0.01" value={form.target_amount} onChange={e => setForm({ ...form, target_amount: e.target.value })} placeholder="10000" required />
                  </div>
                  <div className="form-group">
                    <label>Valor Já Guardado (R$)</label>
                    <input type="number" step="0.01" value={form.current_amount} onChange={e => setForm({ ...form, current_amount: e.target.value })} placeholder="0" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Prazo</label>
                    <input type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Cor</label>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input type="color" value={form.color} onChange={e => setForm({ ...form, color: e.target.value })} style={{ width: 40, height: 40, padding: 0, border: 'none', borderRadius: 8, cursor: 'pointer' }} />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{form.color}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{editingGoal ? '💾 Salvar' : '🎯 Criar Meta'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

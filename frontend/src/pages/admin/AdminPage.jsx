import { useState, useEffect } from 'react';
import api from '../../services/api';
import StatCard from '../../components/ui/StatCard';
import { formatCurrency } from '../../utils/format';
import { Gift, Search, Edit3, Save, RefreshCw, Eye, Trash2, Plus, X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

const PLAN_OPTIONS = ['free', 'individual', 'family', 'business'];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('kpis');
  const [kpis, setKpis] = useState({ mrr: 40, arr: 479, payingUsers: 1, trialUsers: 2, freeUsers: 4, newUsersWeek: 0, churnRate: 0, conversionRate: 8.3 });
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [settings, setSettings] = useState({});
  const [editingSettings, setEditingSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({});
  const [grantModal, setGrantModal] = useState(false);
  const [grantForm, setGrantForm] = useState({ email: '', plan: 'individual' });
  const [traffic, setTraffic] = useState([]);
  const [plans, setPlans] = useState([]);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planForm, setPlanForm] = useState({ id: '', name: '', price: 0, max_accounts: 1, max_transactions: 50, features: '', is_active: true });
  const [viewingUser, setViewingUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(false);

  useEffect(() => {
    if (activeTab === 'kpis') loadKPIs();
    if (activeTab === 'subscriptions') loadUsers();
    if (activeTab === 'settings') loadSettings();
    if (activeTab === 'traffic') loadTraffic();
    if (activeTab === 'plans') loadPlans();
  }, [activeTab]);

  const loadKPIs = async () => { try { const d = await api.getKPIs(); setKpis(d); } catch {} };
  const loadUsers = async () => {
    try { const d = await api.getUsers(search); setUsers(d); } catch {
      setUsers([
        { id: 'u1', email: 'envisionmidiaofc@gmail.com', full_name: 'Envision Mídia', plan: 'individual', plan_status: 'trial', created_at: '2026-01-26', last_login: '2026-03-20' },
        { id: 'u2', email: 'clientmarcaromas@gmail.com', full_name: 'Marc. Aromas', plan: 'individual', plan_status: 'active', created_at: '2026-01-13', last_login: '2026-03-27' },
        { id: 'u3', email: 'mpereirah15@gmail.com', full_name: 'Marcos Pereira Hubner', plan: 'family', plan_status: 'granted', created_at: '2026-01-05', last_login: '2026-03-28' },
        { id: 'u4', email: 'teste@teste.com', full_name: 'Usuário Teste', plan: null, plan_status: 'inactive', created_at: '2026-02-10', last_login: '2026-02-12' },
        { id: 'u5', email: 'maria@email.com', full_name: 'Maria Silva', plan: 'individual', plan_status: 'trial', created_at: '2026-03-01', last_login: '2026-03-15' },
      ]);
    }
  };
  const loadSettings = async () => {
    try { const d = await api.getSettings(); setSettings(d); setSettingsForm(d); } catch {
      const s = { payment_gateway: 'stripe', stripe_secret_key: '', pagarme_secret_key: '', free_trial_days: 14, default_plan: 'free', ai_provider: 'groq', ai_api_key: '', ai_model: 'llama-3.3-70b-versatile', whatsapp_enabled: false, whatsapp_api_key: '' };
      setSettings(s); setSettingsForm(s);
    }
  };
  const loadTraffic = async () => {
    try { const d = await api.getTraffic(); setTraffic(d); } catch {
      setTraffic([
        { date: 'seg', visits: 12, signups: 1 }, { date: 'ter', visits: 18, signups: 0 },
        { date: 'qua', visits: 25, signups: 2 }, { date: 'qui', visits: 15, signups: 0 },
        { date: 'sex', visits: 30, signups: 3 }, { date: 'sab', visits: 8, signups: 0 }, { date: 'dom', visits: 5, signups: 1 },
      ]);
    }
  };

  const saveSettings = async () => {
    try { await api.updateSettings(settingsForm); setSettings(settingsForm); setEditingSettings(false); alert('Configurações salvas!'); } catch (err) { alert('Erro: ' + err.message); }
  };

  const handleGrantAccess = async (e) => {
    e.preventDefault();
    const user = users.find(u => u.email === grantForm.email);
    if (!user) { alert('Usuário não encontrado'); return; }
    try { await api.grantAccess(user.id, grantForm.plan); setGrantModal(false); setGrantForm({ email: '', plan: 'individual' }); loadUsers(); } catch (err) { alert('Erro: ' + err.message); }
  };

  const statusBadge = (status) => {
    const map = { trial: 'badge-warning', active: 'badge-success', granted: 'badge-success', inactive: 'badge-info' };
    const labels = { trial: '⏰ Trial', active: '✅ Ativo', granted: '🎁 Gratuito', inactive: '⚙️ Inativo' };
    return <span className={`badge ${map[status] || 'badge-info'}`}>{labels[status] || status}</span>;
  };

  const loadPlans = async () => { try { const d = await api.getPlans(); setPlans(d); } catch (e) { console.error(e); } };

  const handleSavePlan = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...planForm, features: typeof planForm.features === 'string' ? planForm.features.split('\n').filter(Boolean) : planForm.features };
      if (planForm.id) await api.updatePlan(planForm.id, payload);
      else await api.createPlan(payload);
      setShowPlanModal(false);
      loadPlans();
    } catch (err) { alert('Erro: ' + err.message); }
  };

  const handleDeletePlan = async (id) => {
    if (!confirm('Excluir este plano definitivamente?')) return;
    try { await api.deletePlan(id); loadPlans(); } catch (err) { alert('Erro: ' + err.message); }
  };

  const loadUserDetail = async (id) => {
    setLoadingUser(true);
    setViewingUser({ id }); // open modal instantly in loading state
    try {
      const data = await api.getUserDetail(id);
      setViewingUser(data);
    } catch (err) { alert('Erro ao buscar dados do usuário: ' + err.message); setViewingUser(null); }
    finally { setLoadingUser(false); }
  };

  return (
    <div>
      <div className="page-header"><h1>Admin Dashboard</h1><p>Gerencie planos, leads, configurações do SaaS e métricas</p></div>

      <div className="tabs" style={{ width: 'fit-content', marginBottom: '1.5rem' }}>
        {[
          { key: 'kpis', label: '📊 KPIs' },
          { key: 'subscriptions', label: '💳 Assinaturas' },
          { key: 'plans', label: '⚙️ Planos' },
          { key: 'traffic', label: '📈 Tráfego' },
          { key: 'settings', label: '🔧 Configurações' },
        ].map(t => (
          <button key={t.key} className={`tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {/* KPIs TAB */}
      {activeTab === 'kpis' && (
        <div>
          <div className="grid grid-4" style={{ marginBottom: '1.5rem' }}>
            <StatCard label="💰 MRR" value={formatCurrency(kpis.mrr)} sub="Receita Recorrente Mensal" variant="income" />
            <StatCard label="📈 ARR" value={formatCurrency(kpis.arr)} sub="Receita Anual Projetada" variant="balance" />
            <StatCard label="👥 Assinantes Pagos" value={String(kpis.payingUsers)} variant="neutral" />
            <StatCard label="⏰ Em Trial" value={String(kpis.trialUsers)} variant="savings" />
          </div>
          <div className="grid grid-4" style={{ marginBottom: '1.5rem' }}>
            <StatCard label="🎁 Gratuitos" value={String(kpis.freeUsers)} variant="neutral" />
            <StatCard label="📊 Novos (7d)" value={String(kpis.newUsersWeek)} variant="income" />
            <StatCard label="📉 Churn Rate" value={`${kpis.churnRate || 0}%`} variant="expense" />
            <StatCard label="🔄 Conversão" value={`${kpis.conversionRate || 0}%`} sub="Trial → Pago" variant="savings" />
          </div>
          <div className="card">
            <div className="card-header"><h3 className="card-title">📊 Crescimento de Usuários (últimos 7 dias)</h3><button className="btn btn-secondary btn-sm" onClick={loadKPIs}><RefreshCw size={14} /> Atualizar</button></div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={[{ day: 'seg', users: 2 }, { day: 'ter', users: 0 }, { day: 'qua', users: 1 }, { day: 'qui', users: 0 }, { day: 'sex', users: 3 }, { day: 'sab', users: 0 }, { day: 'dom', users: 1 }]}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="day" stroke="var(--text-muted)" fontSize={12} />
                <YAxis stroke="var(--text-muted)" fontSize={12} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, color: '#fff' }} />
                <Bar dataKey="users" fill="var(--accent-gold)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* SUBSCRIPTIONS TAB */}
      {activeTab === 'subscriptions' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <strong>{users.length} usuários</strong>
            <button className="btn btn-primary btn-sm" onClick={() => setGrantModal(true)}><Gift size={14} /> Conceder Acesso</button>
          </div>
          <div className="search-input" style={{ marginBottom: '1rem' }}>
            <Search size={18} />
            <input placeholder="Buscar por email, nome ou plano..." value={search} onChange={e => { setSearch(e.target.value); }} onKeyDown={e => e.key === 'Enter' && loadUsers()} />
          </div>
          <table className="data-table">
            <thead><tr><th>Usuário</th><th>Plano</th><th>Status</th><th>Cadastro</th><th>Ações</th></tr></thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={i}>
                  <td><div style={{ fontWeight: 500 }}>{u.full_name || '-'}</div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.email}</div></td>
                  <td>{u.plan || '-'}</td>
                  <td>{statusBadge(u.plan_status)}</td>
                  <td style={{ fontSize: '0.8rem' }}>{u.created_at ? new Date(u.created_at).toLocaleDateString('pt-BR') : '-'}</td>
                  <td>
                     <button className="btn-icon" onClick={() => loadUserDetail(u.id)} title="Ver Detalhes">
                       <Eye size={16} />
                     </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Grant Modal */}
          {grantModal && (
            <div className="modal-overlay" onClick={() => setGrantModal(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
                <div className="modal-header"><h2>🎁 Conceder Acesso Gratuito</h2><button onClick={() => setGrantModal(false)} style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: '1.25rem' }}>✕</button></div>
                <form onSubmit={handleGrantAccess}>
                  <div className="modal-body">
                    <div className="form-group"><label>Email do Usuário *</label><input value={grantForm.email} onChange={e => setGrantForm({ ...grantForm, email: e.target.value })} placeholder="usuario@email.com" required /></div>
                    <div className="form-group"><label>Plano</label><select value={grantForm.plan} onChange={e => setGrantForm({ ...grantForm, plan: e.target.value })}>{PLAN_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                  </div>
                  <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setGrantModal(false)}>Cancelar</button><button type="submit" className="btn btn-primary">🎁 Conceder</button></div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PLANS TAB */}
      {activeTab === 'plans' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
             <button className="btn btn-primary" onClick={() => {
                setPlanForm({ id: '', name: '', price: 0, max_accounts: 1, max_transactions: 50, features: '', is_active: true });
                setShowPlanModal(true);
             }}><Plus size={16} /> Criar Novo Plano</button>
          </div>
          <div className="grid grid-3">
            {plans.map(plan => (
              <div key={plan.id} className="card" style={{ position: 'relative', borderTop: `4px solid ${plan.price === 0 ? 'var(--text-muted)' : plan.price <= 20 ? 'var(--accent-gold)' : 'var(--accent-purple)'}` }}>
                {/* Actions */}
                <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: '4px' }}>
                  <button className="btn-icon" onClick={() => {
                     setPlanForm({ ...plan, features: (plan.features||[]).join('\n') });
                     setShowPlanModal(true);
                  }}><Edit3 size={14} /></button>
                  <button className="btn-icon" onClick={() => handleDeletePlan(plan.id)}><Trash2 size={14} /></button>
                </div>

                <div style={{ textAlign: 'center', padding: '1.5rem 0 1rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '1.25rem', marginBottom: '0.25rem' }}>{plan.name} {!plan.is_active && <span className="badge badge-warning" style={{ fontSize: '10px' }}>Inativo</span>}</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent-gold)' }}>{plan.price === 0 ? 'Grátis' : formatCurrency(plan.price)}</div>
                  {plan.price > 0 && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>por mês</div>}
                </div>
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>Limites:</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>📦 {plan.max_accounts} conta{plan.max_accounts > 1 ? 's' : ''}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>📄 {plan.max_transactions === -1 ? 'Ilimitadas' : plan.max_transactions} transações</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>Funcionalidades:</div>
                  {(plan.features||[]).map((f, i) => <div key={i} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>✅ {f}</div>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TRAFFIC TAB */}
      {activeTab === 'traffic' && (
        <div>
          <div className="grid grid-3" style={{ marginBottom: '1.5rem' }}>
            <StatCard label="Visitas (7d)" value={String(traffic.reduce((s, t) => s + (t.visits || 0), 0))} variant="neutral" />
            <StatCard label="Cadastros (7d)" value={String(traffic.reduce((s, t) => s + (t.signups || 0), 0))} variant="income" />
            <StatCard label="Taxa Conversão" value={`${traffic.length ? ((traffic.reduce((s, t) => s + (t.signups || 0), 0) / traffic.reduce((s, t) => s + (t.visits || 0), 0)) * 100).toFixed(1) : 0}%`} variant="savings" />
          </div>
          <div className="card">
            <div className="card-header"><h3 className="card-title">📈 Tráfego dos Últimos 7 Dias</h3></div>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={traffic}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} />
                <YAxis stroke="var(--text-muted)" fontSize={12} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, color: '#fff' }} />
                <Line type="monotone" dataKey="visits" stroke="var(--accent-gold)" strokeWidth={2} name="Visitas" />
                <Line type="monotone" dataKey="signups" stroke="var(--color-success)" strokeWidth={2} name="Cadastros" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* SETTINGS TAB */}
      {activeTab === 'settings' && (
        <div>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header"><h3 className="card-title">💳 Gateway de Pagamento</h3>{!editingSettings && <button className="btn btn-secondary btn-sm" onClick={() => setEditingSettings(true)}><Edit3 size={14} /> Editar</button>}</div>
            <div className="form-row">
              <div className="form-group">
                <label>Gateway Principal</label>
                <select value={settingsForm.payment_gateway} onChange={e => setSettingsForm({ ...settingsForm, payment_gateway: e.target.value })} disabled={!editingSettings}>
                  <option value="stripe">Stripe</option><option value="pagarme">Pagar.me</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Stripe Secret Key</label><input type="password" value={settingsForm.stripe_secret_key || ''} onChange={e => setSettingsForm({ ...settingsForm, stripe_secret_key: e.target.value })} disabled={!editingSettings} placeholder="sk_live_..." /></div>
              <div className="form-group"><label>Pagar.me Secret Key</label><input type="password" value={settingsForm.pagarme_secret_key || ''} onChange={e => setSettingsForm({ ...settingsForm, pagarme_secret_key: e.target.value })} disabled={!editingSettings} placeholder="ak_live_..." /></div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header"><h3 className="card-title">🤖 Configuração de IA</h3></div>
            <div className="form-row">
              <div className="form-group"><label>Provedor de IA</label><select value={settingsForm.ai_provider || ''} onChange={e => setSettingsForm({ ...settingsForm, ai_provider: e.target.value })} disabled={!editingSettings}><option value="groq">Groq (Llama 3)</option><option value="huggingface">HuggingFace</option><option value="together">Together.ai</option></select></div>
              <div className="form-group"><label>Modelo</label><input value={settingsForm.ai_model || ''} onChange={e => setSettingsForm({ ...settingsForm, ai_model: e.target.value })} disabled={!editingSettings} /></div>
            </div>
            <div className="form-group"><label>API Key</label><input type="password" value={settingsForm.ai_api_key || ''} onChange={e => setSettingsForm({ ...settingsForm, ai_api_key: e.target.value })} disabled={!editingSettings} placeholder="gsk_..." /></div>
          </div>

          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header"><h3 className="card-title">⚙️ Configurações Gerais</h3></div>
            <div className="form-row">
              <div className="form-group"><label>Dias de Trial Grátis</label><input type="number" value={settingsForm.free_trial_days || 14} onChange={e => setSettingsForm({ ...settingsForm, free_trial_days: parseInt(e.target.value) })} disabled={!editingSettings} /></div>
              <div className="form-group"><label>Plano Padrão</label><select value={settingsForm.default_plan || 'free'} onChange={e => setSettingsForm({ ...settingsForm, default_plan: e.target.value })} disabled={!editingSettings}><option value="free">Gratuito</option><option value="individual">Individual</option><option value="family">Família</option></select></div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input type="checkbox" checked={settingsForm.whatsapp_enabled || false} onChange={e => setSettingsForm({ ...settingsForm, whatsapp_enabled: e.target.checked })} disabled={!editingSettings} />
                  WhatsApp Integration
                </label>
              </div>
              <div className="form-group"><label>WhatsApp API Key</label><input type="password" value={settingsForm.whatsapp_api_key || ''} onChange={e => setSettingsForm({ ...settingsForm, whatsapp_api_key: e.target.value })} disabled={!editingSettings || !settingsForm.whatsapp_enabled} /></div>
            </div>
          </div>

          {editingSettings && (
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-primary" onClick={saveSettings}><Save size={16} /> Salvar Configurações</button>
              <button className="btn btn-secondary" onClick={() => { setEditingSettings(false); setSettingsForm(settings); }}>Cancelar</button>
            </div>
          )}
        </div>
      )}

      {/* PLAN CRUD MODAL */}
      {showPlanModal && (
        <div className="modal-overlay" onClick={() => setShowPlanModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header"><h2>{planForm.id ? 'Editar Plano' : 'Novo Plano'}</h2><button onClick={() => setShowPlanModal(false)} className="btn-icon"><X size={18}/></button></div>
            <form onSubmit={handleSavePlan}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group"><label>Nome do Plano</label><input value={planForm.name} onChange={e => setPlanForm({ ...planForm, name: e.target.value })} required /></div>
                  <div className="form-group"><label>Preço (R$)</label><input type="number" step="0.01" value={planForm.price} onChange={e => setPlanForm({ ...planForm, price: e.target.value })} required /></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Límite de Contas</label><input type="number" value={planForm.max_accounts} onChange={e => setPlanForm({ ...planForm, max_accounts: e.target.value })} required /></div>
                  <div className="form-group"><label>Límite de Transações (-1 ilimitado)</label><input type="number" value={planForm.max_transactions} onChange={e => setPlanForm({ ...planForm, max_transactions: e.target.value })} required /></div>
                </div>
                <div className="form-group">
                  <label>Funcionalidades (uma por linha)</label>
                  <textarea rows="4" value={planForm.features} onChange={e => setPlanForm({ ...planForm, features: e.target.value })} placeholder="IA Completa\nImportação OFX"></textarea>
                </div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input type="checkbox" checked={planForm.is_active} onChange={e => setPlanForm({ ...planForm, is_active: e.target.checked })} />
                    Ativar (Visível no site)
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowPlanModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary"><Save size={16}/> Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW USER MODAL */}
      {viewingUser && (
        <div className="modal-overlay" onClick={() => setViewingUser(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 650 }}>
            <div className="modal-header">
               <h2>Auditoria de Conta</h2>
               <button onClick={() => setViewingUser(null)} className="btn-icon"><X size={18}/></button>
            </div>
            <div className="modal-body">
               {loadingUser || !viewingUser.email ? (
                 <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}><RefreshCw size={24} className="animate-spin" /><br/>Carregando raio-x...</div>
               ) : (
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px' }}>
                       <div style={{ width: 50, height: 50, borderRadius: '50%', background: 'var(--accent-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.25rem', color: '#111' }}>
                         {(viewingUser.full_name || 'U')[0]}
                       </div>
                       <div>
                          <div style={{ fontSize: '1.15rem', fontWeight: 600 }}>{viewingUser.full_name || 'Usuário Sem Nome'}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{viewingUser.email} • Registrado em {new Date(viewingUser.created_at).toLocaleDateString()}</div>
                       </div>
                    </div>

                    <div className="grid grid-3">
                       <StatCard label="Transações Lançadas" value={viewingUser.stats?.transactionCount || 0} variant="neutral" />
                       <StatCard label="Contas Fixas Cadastradas" value={viewingUser.stats?.recurringCount || 0} variant="expense" />
                       <StatCard label="Bancos Conectados" value={viewingUser.stats?.accountCount || 0} variant="savings" />
                    </div>

                    <div>
                       <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', fontWeight: 600 }}>Contas Cadastradas</h3>
                       {(viewingUser.accounts || []).length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nenhuma conta financeira detectada.</div> : (
                         <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                            <table style={{ width: '100%', fontSize: '0.85rem', textAlign: 'left', borderCollapse: 'collapse' }}>
                               <tbody>
                                 {viewingUser.accounts.map(acc => (
                                    <tr key={acc.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                       <td style={{ padding: '0.75rem' }}><strong>{acc.name}</strong> <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({acc.institution || acc.type})</span></td>
                                       <td style={{ padding: '0.75rem', textAlign: 'right' }}>{formatCurrency(acc.balance)}</td>
                                    </tr>
                                 ))}
                               </tbody>
                            </table>
                         </div>
                       )}
                    </div>
                 </div>
               )}
            </div>
            <div className="modal-footer">
               <button className="btn btn-secondary" onClick={() => setViewingUser(null)}>Fechar Visualização</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

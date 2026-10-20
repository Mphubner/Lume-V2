import DataError from '../../components/ui/DataError';
import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import StatCard from '../../components/ui/StatCard';
import { formatCurrency } from '../../utils/format';
import { Gift, Search, Edit3, Save, RefreshCw, Eye, Trash2, Plus, X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';


export default function AdminPage() {
  const [states, setStates] = useState({});
  const track = useCallback(async (key, task, setter) => {
    setStates(previous => ({ ...previous, [key]: { loading: true } }));
    try { setter(await task()); setStates(previous => ({ ...previous, [key]: { loaded: true } })); }
    catch (error) { setStates(previous => ({ ...previous, [key]: { error } })); }
  }, []);
  const [activeTab, setActiveTab] = useState('kpis');
  const [kpis, setKpis] = useState({});
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [settings, setSettings] = useState({});
  const [grantModal, setGrantModal] = useState(false);
  const [grantForm, setGrantForm] = useState({ email: '', plan: '' });
  const [traffic, setTraffic] = useState([]);
  const [plans, setPlans] = useState([]);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planForm, setPlanForm] = useState({ id: '', name: '', price: 0, max_accounts: 1, max_transactions: 50, features: '', is_active: true });
  const [viewingUser, setViewingUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(false);

  const loadUsers = useCallback(async () => {
    await track('subscriptions', () => api.getUsers(search), setUsers);
 }, [search, track]);

  const loadKPIs = useCallback(() => track('kpis', () => api.getKPIs(), setKpis), [track]);
  const loadSettings = useCallback(() => track('settings', () => api.getSettings(), setSettings), [track]);
  const loadTraffic = useCallback(() => track('traffic', () => api.getTraffic(), setTraffic), [track]);
  const loadPlans = useCallback(() => track('plans', () => api.getPlans(), setPlans), [track]);
  useEffect(() => {
    if (activeTab === 'kpis') loadKPIs();
    if (activeTab === 'subscriptions') { loadUsers(); loadPlans(); }
    if (activeTab === 'settings') loadSettings();
    if (activeTab === 'traffic') loadTraffic();
    if (activeTab === 'plans') loadPlans();
  }, [activeTab, loadUsers, loadKPIs, loadSettings, loadTraffic, loadPlans]);



  const handleGrantAccess = async (e) => {
    e.preventDefault();
    const user = users.find(u => u.email === grantForm.email);
    if (!user) { alert('Usuário não encontrado'); return; }
    try { await api.grantAccess(user.id, grantForm.plan); setGrantModal(false); setGrantForm({ email: '', plan: '' }); loadUsers(); } catch (err) { alert('Erro: ' + err.message); }
  };

  const statusBadge = (status) => {
    const map = { trial: 'badge-warning', active: 'badge-success', granted: 'badge-success', inactive: 'badge-info' };
    const labels = { trial: '⏰ Trial', active: '✅ Ativo', granted: '🎁 Gratuito', inactive: '⚙️ Inativo' };
    return <span className={`badge ${map[status] || 'badge-info'}`}>{labels[status] || status}</span>;
  };


  const handleSavePlan = async (e) => {
    e.preventDefault();
    try {
      const { id } = planForm;
      const payload = { name: planForm.name, is_active: planForm.is_active, stripe_price_id: planForm.stripe_price_id || null, price: Number(planForm.price), max_accounts: Number(planForm.max_accounts), max_transactions: Number(planForm.max_transactions), max_members: Number(planForm.max_members || 1), features: typeof planForm.features === 'string' ? planForm.features.split('\n').filter(Boolean) : planForm.features };
      if (id) await api.updatePlan(id, payload);
      else await api.createPlan({ ...payload, id: planForm.new_id });
      setShowPlanModal(false);
      loadPlans();
    } catch (err) { alert('Erro: ' + err.message); }
  };

  const handleDeletePlan = async (id) => {
    if (!confirm('Arquivar este plano e retirar do catálogo público?')) return;
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

      {states[activeTab]?.error && <DataError error={states[activeTab].error} onRetry={() => ({ kpis: loadKPIs, subscriptions: loadUsers, settings: loadSettings, traffic: loadTraffic, plans: loadPlans })[activeTab]()} />}
      {!states[activeTab]?.loaded && !states[activeTab]?.error && <p role="status">Consultando dados administrativos…</p>}
      {/* KPIs TAB */}
      {activeTab === 'kpis' && states[activeTab]?.loaded && (
        <div>
          {kpis.mrrComplete === false && <p role="alert">Receita estimada incompleta: confira o catálogo das assinaturas.</p>}
          <div className="grid grid-4" style={{ marginBottom: '1.5rem' }}>
            <StatCard label="💰 MRR" value={formatCurrency(kpis.mrr)} sub="Estimativa pelo catálogo atual das assinaturas ativas" variant="income" />
            <StatCard label="📈 ARR" value={formatCurrency(kpis.arr)} sub="Receita Anual Projetada" variant="balance" />
            <StatCard label="👥 Assinantes Pagos" value={String(kpis.payingUsers)} variant="neutral" />
            <StatCard label="⏰ Em Trial" value={String(kpis.trialUsers)} variant="savings" />
          </div>
          <div className="grid grid-4" style={{ marginBottom: '1.5rem' }}>
            <StatCard label="🎁 Gratuitos" value={String(kpis.freeUsers)} variant="neutral" />
            <StatCard label="📊 Novos (7d)" value={String(kpis.newUsersWeek)} variant="income" />
            <StatCard label="📉 Churn Rate" value={kpis.churnRate == null ? 'Não calculado' : `${kpis.churnRate}%`} variant="expense" />
            <StatCard label="🔄 Conversão" value={kpis.conversionRate == null ? 'Não calculado' : `${kpis.conversionRate}%`} sub="Assinantes pagos / usuários cadastrados" variant="savings" />
          </div>
          <div className="card">
            <div className="card-header"><h3 className="card-title">📊 Crescimento de Usuários (últimos 7 dias)</h3><button className="btn btn-secondary btn-sm" onClick={loadKPIs}><RefreshCw size={14} /> Atualizar</button></div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={kpis.userGrowth || []}>
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
      {activeTab === 'subscriptions' && states[activeTab]?.loaded && (
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
                    <div className="form-group"><label>Plano</label><select value={grantForm.plan} onChange={e => setGrantForm({ ...grantForm, plan: e.target.value })}><option value="">Selecione um plano ativo</option>{plans.filter(p => p.is_active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                  </div>
                  <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setGrantModal(false)}>Cancelar</button><button type="submit" className="btn btn-primary">🎁 Conceder</button></div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PLANS TAB */}
      {activeTab === 'plans' && states[activeTab]?.loaded && (
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

      {activeTab === 'traffic' && states[activeTab]?.loaded && <div>
        <div className="grid grid-4"><StatCard label="Visitas registradas (7 dias)" value={String(traffic.last7Days?.views ?? 'Não confirmado')} /><StatCard label="Visitantes distintos registrados (7 dias)" value={String(traffic.last7Days?.unique ?? 'Não confirmado')} /><StatCard label="Visitas registradas (30 dias)" value={String(traffic.last30Days?.views ?? 'Não confirmado')} /><StatCard label="Visitantes distintos registrados (30 dias)" value={String(traffic.last30Days?.unique ?? 'Não confirmado')} /></div>
        <div className="card"><h3>Páginas registradas nos últimos 30 dias</h3><p>Estes dados refletem apenas eventos recebidos; ausência de eventos não comprova ausência de visitas.</p><ul>{(traffic.topPages || []).map(page => <li key={page.page}>{page.page}: {page.count}</li>)}</ul><h3>Dispositivos registrados</h3><ul>{Object.entries(traffic.devices || {}).map(([device,count]) => <li key={device}>{device}: {count}</li>)}</ul></div>
      </div>}

      {activeTab === 'settings' && states[activeTab]?.loaded && <div className="card"><h2>Configuração do ambiente</h2><p>Segredos e habilitação de serviços são administrados nas variáveis do servidor. Esta tela informa somente o estado, sem receber ou revelar credenciais.</p><dl>{Object.entries(settings).map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === 'boolean' ? value ? 'Habilitado' : 'Desabilitado' : String(value)}</dd></div>)}</dl><button className="btn btn-secondary" onClick={loadSettings}>Atualizar estado</button></div>}

      {/* PLAN CRUD MODAL */}
      {showPlanModal && (
        <div className="modal-overlay" onClick={() => setShowPlanModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header"><h2>{planForm.id ? 'Editar Plano' : 'Novo Plano'}</h2><button onClick={() => setShowPlanModal(false)} className="btn-icon"><X size={18}/></button></div>
            <form onSubmit={handleSavePlan}>
              <div className="modal-body">
                <div className="form-row">
                  {!planForm.id && <label>Identificador do plano<input required value={planForm.new_id || ''} onChange={e => setPlanForm({ ...planForm, new_id: e.target.value })} /></label>}
                  <label>ID do preço no Stripe<input value={planForm.stripe_price_id || ''} onChange={e => setPlanForm({ ...planForm, stripe_price_id: e.target.value })} /></label>
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

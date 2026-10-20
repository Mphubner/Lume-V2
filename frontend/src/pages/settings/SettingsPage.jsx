import WorkspaceManagement from '../../components/ui/WorkspaceManagement';
import SubscriptionSettings from '../../components/ui/SubscriptionSettings';
import AccountReconciliation from '../../components/ui/AccountReconciliation';
import DataError from '../../components/ui/DataError';
import { useWorkspace } from '../../context/WorkspaceContext';
import { localToday } from '../../utils/finance';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { formatCurrency } from '../../utils/format';
import { Save, Trash2, Plus, Edit3, Users, CreditCard, Settings as SettingsIcon, Building2 } from 'lucide-react';

export default function SettingsPage() {
  const { profile, refreshProfile } = useAuth();
  const { currentWorkspace, workspaces } = useWorkspace();
  const [activeTab, setActiveTab] = useState(() => new URLSearchParams(window.location.search).has('payment') ? 'subscription' : 'profile');
  const [profileForm, setProfileForm] = useState({
    full_name: '', phone: '', cpf: '', cep: '', street: '', street_number: '', complement: '', neighborhood: '', city: '', state: '',
  });
  const [aiRules, setAiRules] = useState([]);
  const [aiStats, setAiStats] = useState({ activeRules: 0, totalApplications: 0, totalRules: 0 });
  const [categories, setCategories] = useState([]);
  const [newCat, setNewCat] = useState({ name: '', icon: '📦', type: 'expense', color: '#6366f1' });
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [accountForm, setAccountForm] = useState({ name: '', type: 'checking', account_type: 'personal', institution: '', balance: '0', balance_date: localToday(), credit_limit: '', closing_day: '', due_day: '', color: '#d4a843', icon: '🏦' });
  const [saving, setSaving] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [reconcilingAccount, setReconcilingAccount] = useState(null);
  const [loadState, setLoadState] = useState({});
  const [privacyNotice, setPrivacyNotice] = useState('');
  const [auditLogs, setAuditLogs] = useState([]);


  useEffect(() => {
    if (profile) {
      setProfileForm({
        full_name: profile.full_name || '', phone: profile.phone || '', cpf: profile.cpf || '',
        cep: profile.cep || '', street: profile.street || '', street_number: profile.street_number || '',
        complement: profile.complement || '', neighborhood: profile.neighborhood || '', city: profile.city || '', state: profile.state || '',
      });
    }
  }, [profile]);

  const loadTab = useCallback(async (key, operation) => {
    setLoadState(state => ({ ...state, [key]: { loading: true } }));
    try { await operation(); setLoadState(state => ({ ...state, [key]: { loaded: true } })); }
    catch (error) { setLoadState(state => ({ ...state, [key]: { error } })); }
  }, []);
  const loadAudit = useCallback(() => loadTab('audit', async () => { const logs = await api.getAuditLog(); setAuditLogs(Array.isArray(logs) ? logs : []); }), [loadTab]);
  const loadAIRules = useCallback(() => loadTab('ai', async () => { const result = await api.getAIRules(); setAiRules(result.rules || []); setAiStats(result.stats); }), [loadTab]);
  const loadCategories = useCallback(() => loadTab('categories', async () => { setCategories(await api.getCategories()); }), [loadTab]);
  const loadAccounts = useCallback(() => loadTab('accounts', async () => { setAccounts(await api.getAccounts()); }), [loadTab]);
  useEffect(() => {
    if (activeTab === 'ai') void loadAIRules();
    if (activeTab === 'preferences') { void loadCategories(); void loadAccounts(); }
    if (activeTab === 'audit') void loadAudit();
  }, [activeTab, currentWorkspace, loadAIRules, loadCategories, loadAccounts, loadAudit]);
  const tabErrors = activeTab === 'preferences' ? ['accounts', 'categories'] : [activeTab];
  const errorKey = tabErrors.find(key => loadState[key]?.error);
  const tabReady = !['preferences', 'audit', 'ai'].includes(activeTab) || tabErrors.every(key => loadState[key]?.loaded);
  const retryTab = () => { if (activeTab === 'preferences') { loadAccounts(); loadCategories(); } else if (activeTab === 'ai') loadAIRules(); else loadAudit(); };
  const exportData = async () => {
    setSaving(true);
    try {
      const data = await api.request('/profile/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'lume-dados.json'; link.click(); URL.revokeObjectURL(url);
      setPrivacyNotice('Arquivo gerado com os dados autorizados do contexto selecionado.');
    } catch (error) { setPrivacyNotice(error.message); } finally { setSaving(false); }
  };
  const privacyRequest = async kind => {
    if (kind === 'deletion' && !confirm('Registrar solicitação de exclusão de dados? A análise pode exigir retenções legais e não é uma exclusão imediata.')) return;
    setSaving(true);
    try { const result = await api.request('/profile/privacy-request', { method: 'POST', body: { kind } }); setPrivacyNotice(`Solicitação registrada: ${result.id}. Situação: pendente de atendimento. Nenhum dado foi excluído automaticamente.`); }
    catch (error) { setPrivacyNotice(error.message); } finally { setSaving(false); }
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
       await api.updateProfile(profileForm);
       if (refreshProfile) await refreshProfile();
       alert('Perfil salvo com sucesso!');
    } catch (err) {
       alert('Erro ao salvar Perfil: ' + err.message);
    } finally {
       setSaving(false);
    }
  };

  const deleteRule = async (id) => {
    try { await api.deleteAIRule(id); loadAIRules(); } catch (error) { console.error(error); }
  };
  const toggleRule = async (rule) => {
    try { await api.updateAIRule(rule.id, { is_active: !rule.is_active }); loadAIRules(); } catch (error) { console.error(error); }
  };

  const saveCategory = async (e) => {
    e.preventDefault();
    try {
      if (editingCategory) {
        await api.updateCategory(editingCategory.id, newCat);
      } else {
        await api.createCategory(newCat);
      }
      setShowCatModal(false);
      setNewCat({ name: '', icon: '📦', type: 'expense', color: '#6366f1', subcategories: [] });
      setEditingCategory(null);
      loadCategories();
    } catch (err) { alert('Erro: ' + err.message); }
  };

  const deleteCategory = async () => {
    if (!confirm('Tem certeza que deseja excluir esta categoria? Deletar categorias pode remover a relação visual de transações antigas.')) return;
    try {
      await api.deleteCategory(editingCategory.id);
      setShowCatModal(false);
      setEditingCategory(null);
      loadCategories();
    } catch (err) {
      alert('Erro ao excluir: ' + err.message);
    }
  };

  const openNewCategory = () => {
    setEditingCategory(null);
    setNewCat({ name: '', icon: '📦', type: 'expense', color: '#6366f1', group_name: '', nature: 'variable', subcategories: [] });
    setShowCatModal(true);
  };

  const openEditCategory = (cat) => {
    if (cat.is_system) {
       alert("Categorias do sistema não podem ser editadas para preservar a inteligência da plataforma.");
       return;
    }
    setEditingCategory(cat);
    setNewCat({
      name: cat.name,
      icon: cat.icon || '📦',
      type: cat.type || 'expense',
      color: cat.color || '#6366f1',
      group_name: cat.group_name || '',
      nature: cat.nature || 'variable',
      subcategories: Array.isArray(cat.subcategories) ? cat.subcategories : []
    });
    setShowCatModal(true);
  };

  const createAccount = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...accountForm, workspace: accountForm.workspace || currentWorkspace, balance: Number(accountForm.balance), credit_limit: accountForm.credit_limit ? Number(accountForm.credit_limit) : null, closing_day: accountForm.closing_day ? Number(accountForm.closing_day) : null, due_day: accountForm.due_day ? Number(accountForm.due_day) : null };
      if (editingAccount) await api.updateAccount(editingAccount.id, payload);
      else await api.createAccount(payload);
      setShowAccountModal(false); loadAccounts();
    } catch (err) { alert('Erro: ' + err.message); }
  };
  const deleteAccount = async (id) => { if (confirm('Arquivar esta conta? O histórico financeiro será preservado.')) { try { await api.deleteAccount(id); loadAccounts(); } catch (error) { console.error(error); } } };

  const openAccount = (account = null) => {
    setEditingAccount(account);
    setAccountForm(account ? { name: account.name, type: account.type, account_type: account.account_type, institution: account.institution || '', balance: account.opening_balance == null ? '' : String(account.opening_balance), balance_date: account.balance_date || '', credit_limit: account.credit_limit ?? '', closing_day: account.closing_day ?? '', due_day: account.due_day ?? '', color: account.color || '#d4a843', icon: account.icon || '🏦', workspace: account.workspace_id } : { name: '', type: 'checking', account_type: 'personal', institution: '', balance: '', balance_date: localToday(), credit_limit: '', closing_day: '', due_day: '', color: '#d4a843', icon: '🏦', workspace: currentWorkspace === 'all' ? '' : currentWorkspace });
    setShowAccountModal(true);
  };


  const TABS = [
    { key: 'profile', label: '👤 Perfil' },
    { key: 'preferences', label: '⚙️ Contas e Categorias' },
    { key: 'subscription', label: '💳 Assinatura' },
    { key: 'family', label: '👥 Família & Empresa' },
    { key: 'ai', label: '🤖 IA' },
    { key: 'integrations', label: '🔌 Integrações' },
    { key: 'audit', label: '📋 Auditoria' },
  ];

  return (
    <div>
      <div className="page-header"><h1>Configurações</h1><p>Gerencie suas preferências, contas e dados</p></div>
      <div className="tabs" style={{ width: 'fit-content', marginBottom: '1.5rem' }}>
        {TABS.map(t => <button key={t.key} className={`tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>{t.label}</button>)}
      </div>

      {errorKey && <DataError error={loadState[errorKey].error} onRetry={retryTab} />}
      {!tabReady && !errorKey && <p role="status">Carregando dados desta seção…</p>}
      {/* PROFILE TAB */}
      {activeTab === 'profile' && (
        <div className="card" style={{ maxWidth: 650 }}>
          <h3 className="card-title" style={{ marginBottom: '1.5rem' }}>👤 Informações Pessoais</h3>
          <div className="form-row"><div className="form-group"><label>Nome Completo</label><input value={profileForm.full_name} onChange={e => setProfileForm({ ...profileForm, full_name: e.target.value })} /></div><div className="form-group"><label>Email</label><input value={profile?.email || ''} readOnly style={{ opacity: 0.5 }} /></div></div>
          <div className="form-row"><div className="form-group"><label>Telefone</label><input value={profileForm.phone} onChange={e => setProfileForm({ ...profileForm, phone: e.target.value })} placeholder="(99) 99999-9999" /></div><div className="form-group"><label>CPF</label><input value={profileForm.cpf} onChange={e => setProfileForm({ ...profileForm, cpf: e.target.value })} placeholder="000.000.000-00" /></div></div>
          <h3 className="card-title" style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>📍 Endereço</h3>
          <div className="form-row"><div className="form-group"><label>CEP</label><input value={profileForm.cep} onChange={e => setProfileForm({ ...profileForm, cep: e.target.value })} placeholder="00000-000" /></div><div className="form-group"><label>Rua</label><input value={profileForm.street} onChange={e => setProfileForm({ ...profileForm, street: e.target.value })} /></div></div>
          <div className="form-row"><div className="form-group"><label>Número</label><input value={profileForm.street_number} onChange={e => setProfileForm({ ...profileForm, street_number: e.target.value })} /></div><div className="form-group"><label>Complemento</label><input value={profileForm.complement} onChange={e => setProfileForm({ ...profileForm, complement: e.target.value })} /></div></div>
          <div className="form-row"><div className="form-group"><label>Bairro</label><input value={profileForm.neighborhood} onChange={e => setProfileForm({ ...profileForm, neighborhood: e.target.value })} /></div><div className="form-group"><label>Cidade / UF</label><div style={{ display: 'flex', gap: '0.5rem' }}><input value={profileForm.city} onChange={e => setProfileForm({ ...profileForm, city: e.target.value })} style={{ flex: 1 }} /><input value={profileForm.state} onChange={e => setProfileForm({ ...profileForm, state: e.target.value })} style={{ width: 60 }} placeholder="UF" /></div></div></div>
          <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={saveProfile} disabled={saving}><Save size={16} /> {saving ? 'Salvando...' : 'Salvar'}</button>
          <section style={{ marginTop: '2rem' }}><h3>Seus dados e privacidade</h3><p>Exportação respeita o contexto selecionado. Pedidos de acesso, correção ou exclusão ficam registrados para atendimento.</p><div className="page-header-actions"><button className="btn btn-secondary" disabled={saving} onClick={exportData}>Exportar meus dados</button><button className="btn btn-secondary" disabled={saving} onClick={() => privacyRequest('correction')}>Solicitar correção</button><button className="btn btn-secondary" disabled={saving} onClick={() => privacyRequest('deletion')}>Solicitar exclusão</button></div>{privacyNotice && <p role="status">{privacyNotice}</p>}<a href="/privacidade">Política de privacidade em revisão</a></section>
        </div>
      )}

      {/* PREFERENCES TAB - Accounts & Categories */}
      {activeTab === 'preferences' && tabReady && (
        <div>
          {/* Accounts */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <h3 className="card-title">🏦 Minhas Contas</h3>
              <button className="btn btn-primary btn-sm" onClick={() => openAccount()}><Plus size={14} /> Nova Conta</button>
            </div>
            {accounts.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nenhuma conta cadastrada</p> : (
              <div className="grid grid-3">
                {accounts.map(acc => (
                  <div key={acc.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--border-radius-sm)', borderLeft: `4px solid ${acc.color}` }}>
                    <span style={{ fontSize: '1.5rem' }}>{acc.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{acc.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{acc.institution} • {acc.type === 'credit_card' ? 'Cartão' : acc.type === 'checking' ? 'Conta Corrente' : acc.type}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{formatCurrency(acc.balance)}</div>
                    </div>
                    <button className="btn-icon" aria-label={`Editar conta ${acc.name}`} onClick={() => openAccount(acc)}><Edit3 size={14} /></button><button className="btn btn-secondary btn-sm" onClick={() => setReconcilingAccount(acc)}>Conferir saldo</button><button className="btn-icon" aria-label={`Arquivar conta ${acc.name}`} onClick={() => deleteAccount(acc.id)}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Categories */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">📦 Categorias</h3>
              <button className="btn btn-primary btn-sm" onClick={openNewCategory}><Plus size={14} /> Nova Categoria</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {Object.entries(
                categories.reduce((acc, cat) => {
                  const group = cat.type === 'expense' ? 'Despesas' : cat.type === 'income' ? 'Receitas' : 'Outros / Ajustes';
                  if (!acc[group]) acc[group] = [];
                  acc[group].push(cat);
                  return acc;
                }, {})
              ).map(([group, cats]) => (
                <div key={group} style={{ marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {group}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
                    {cats.map(cat => (
                      <div
                        key={cat.id}
                        style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem', borderRadius: 'var(--border-radius-lg)', background: 'var(--bg-secondary)', borderLeft: `4px solid ${cat.color || 'var(--border-color)'}`, position: 'relative' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                            {cat.icon} {cat.name}
                          </span>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                             {cat.is_system && <span style={{ padding: '0.1rem 0.375rem', fontSize: '0.65rem', borderRadius: '4px', background: cat.color ? `${cat.color}20` : 'rgba(255,255,255,0.1)', color: cat.color || '#fff', fontWeight: 600 }}>sistema</span>}
                             {!cat.is_system && <Edit3 size={14} style={{ opacity: 0.5, cursor: 'pointer' }} onClick={() => openEditCategory(cat)} />}
                          </div>
                        </div>
                        {cat.subcategories && cat.subcategories.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.25rem' }}>
                            {cat.subcategories.map(s => (
                              <span key={s} style={{ padding: '0.15rem 0.4rem', fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                                {s}
                              </span>
                            ))}
                          </div>
                        )}
                        {(!cat.subcategories || cat.subcategories.length === 0) && (
                           <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Nenhuma subcategoria</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Account Modal */}
          {showAccountModal && (
            <div className="modal-overlay" onClick={() => setShowAccountModal(false)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header"><h2>{editingAccount ? "Editar saldo-base e conta" : "Nova conta"}</h2><button onClick={() => setShowAccountModal(false)} style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: '1.25rem' }}>✕</button></div>
                <form onSubmit={createAccount}>
                  <div className="modal-body">
                    <div className="form-row"><div className="form-group"><label>Nome *</label><input value={accountForm.name} onChange={e => setAccountForm({ ...accountForm, name: e.target.value })} placeholder="Nubank, Itaú..." required /></div><div className="form-group"><label>Instituição</label><input value={accountForm.institution} onChange={e => setAccountForm({ ...accountForm, institution: e.target.value })} placeholder="Nubank" /></div></div>
                    <div className="form-row">
                      <div className="form-group"><label>Tipo</label><select value={accountForm.type} onChange={e => setAccountForm({ ...accountForm, type: e.target.value })}><option value="checking">Conta Corrente</option><option value="savings">Poupança</option><option value="credit_card">Cartão de Crédito</option><option value="investment">Investimento</option><option value="wallet">Carteira</option></select></div>
                      <div className="form-group"><label>Titularidade (determinada pelo contexto)</label><select disabled value={accountForm.account_type} onChange={e => setAccountForm({ ...accountForm, account_type: e.target.value })}><option value="personal">Pessoal (Usuário)</option><option value="business">Empresarial (PJ/Empresa)</option></select></div>
                      <div className="form-group"><label>{accountForm.type === 'credit_card' ? 'Limite' : 'Saldo de fechamento na data-base'} (R$)</label><input required type="number" step="0.01" value={accountForm.type === 'credit_card' ? accountForm.credit_limit : accountForm.balance} onChange={e => setAccountForm({ ...accountForm, [accountForm.type === 'credit_card' ? 'credit_limit' : 'balance']: e.target.value })} /></div>
                    </div>
                    <label>Contexto da conta<select required disabled={Boolean(editingAccount)} value={accountForm.workspace || (currentWorkspace !== 'all' ? currentWorkspace : '')} onChange={e => setAccountForm({ ...accountForm, workspace: e.target.value })}><option value="">Selecione o titular/contexto</option>{workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
                    <label>Data-base do saldo<input type="date" required value={accountForm.balance_date} onChange={e => setAccountForm({ ...accountForm, balance_date: e.target.value })} /></label><p>Saldo de fechamento nesse dia. Somente movimentos posteriores serão somados. Para cartão, informe a dívida como saldo negativo.</p>
                    {accountForm.type === 'credit_card' && <label>Saldo da fatura / dívida (R$)<input required type="number" step="0.01" value={accountForm.balance} onChange={e => setAccountForm({ ...accountForm, balance: e.target.value })} /></label>}
                    {accountForm.type === 'credit_card' && (
                      <div className="form-row"><div className="form-group"><label>Dia de Fechamento</label><input type="number" min="1" max="31" value={accountForm.closing_day} onChange={e => setAccountForm({ ...accountForm, closing_day: e.target.value })} /></div><div className="form-group"><label>Dia de Vencimento</label><input type="number" min="1" max="31" value={accountForm.due_day} onChange={e => setAccountForm({ ...accountForm, due_day: e.target.value })} /></div></div>
                    )}
                  </div>
                  <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setShowAccountModal(false)}>Cancelar</button><button type="submit" className="btn btn-primary">💾 Salvar</button></div>
                </form>
              </div>
            </div>
          )}

          {/* Category Modal */}
          {showCatModal && (
            <div className="modal-overlay" onClick={() => setShowCatModal(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
                <div className="modal-header"><h2>{editingCategory ? '✏️ Editar Categoria' : '📦 Nova Categoria'}</h2><button onClick={() => setShowCatModal(false)} style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: '1.25rem' }}>✕</button></div>
                <form onSubmit={saveCategory}>
                  <div className="modal-body">
                    <div className="form-group"><label>Nome</label><input value={newCat.name} onChange={e => setNewCat({ ...newCat, name: e.target.value })} required /></div>
                    <div className="form-row">
                      <div className="form-group"><label>Ícone</label><input value={newCat.icon} onChange={e => setNewCat({ ...newCat, icon: e.target.value })} maxLength={2} /></div>
                      <div className="form-group"><label>Tipo</label><select value={newCat.type} onChange={e => setNewCat({ ...newCat, type: e.target.value })}><option value="expense">Despesa</option><option value="income">Receita</option><option value="both">Ambos</option></select></div>
                    </div>
                    <div className="form-group">
                      <label>Subcategorias</label>
                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <input
                          id="new-subcat-input"
                          placeholder="Digite e aperte Enter..."
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const val = e.target.value.trim();
                              if (val && !newCat.subcategories.includes(val)) {
                                setNewCat({ ...newCat, subcategories: [...newCat.subcategories, val] });
                                e.target.value = '';
                              }
                            }
                          }}
                        />
                        <button type="button" className="btn btn-secondary" onClick={() => {
                          const input = document.getElementById('new-subcat-input');
                          const val = input.value.trim();
                          if (val && !newCat.subcategories.includes(val)) {
                            setNewCat({ ...newCat, subcategories: [...newCat.subcategories, val] });
                            input.value = '';
                          }
                        }}>Add</button>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {newCat.subcategories?.map(sub => (
                          <span key={sub} className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--bg-secondary)' }}>
                            {sub}
                            <button type="button" onClick={() => setNewCat({ ...newCat, subcategories: newCat.subcategories.filter(s => s !== sub) })} style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', cursor: 'pointer', fontSize: '10px' }}>✕</button>
                          </span>
                        ))}
                      </div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Essas serão as subcategorias passadas para a IA e listadas nos lançamentos.</p>
                    </div>
                    <div className="form-group">
                      <label>Cor de Identificação</label>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {['#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'].map(color => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => setNewCat({ ...newCat, color })}
                            style={{
                              width: 24, height: 24, borderRadius: '50%', background: color, border: 'none', cursor: 'pointer',
                              boxShadow: newCat.color === color ? `0 0 0 2px var(--bg-card), 0 0 0 4px ${color}` : 'none',
                              transition: 'all 0.2s'
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    {editingCategory && !editingCategory.is_system ? (
                      <button type="button" className="btn btn-secondary" style={{ color: 'var(--color-danger)', borderColor: 'var(--color-danger)' }} onClick={deleteCategory}><Trash2 size={16}/></button>
                    ) : <div />}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button type="button" className="btn btn-secondary" onClick={() => setShowCatModal(false)}>Cancelar</button><button type="submit" className="btn btn-primary">💾 Salvar</button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'subscription' && <SubscriptionSettings />}
      {reconcilingAccount && <AccountReconciliation account={reconcilingAccount} onClose={() => setReconcilingAccount(null)} onSaved={loadAccounts} />}

      {activeTab === 'family' && <WorkspaceManagement />}

      {/* AI TAB */}
      {activeTab === 'ai' && tabReady && (
        <div>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div><h3 style={{ fontWeight: 600 }}>💬 Lume no WhatsApp</h3><p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Integração ainda não habilitada. Use importação e revisão de extratos.</p></div>
              <button className="btn btn-primary" disabled title="Recurso ainda indisponível">WhatsApp indisponível</button>
            </div>

          </div>

          <div className="card">
            <div className="card-header"><h3 className="card-title">🤖 Regras de Categorização da IA</h3></div>
            <div className="grid grid-3" style={{ marginBottom: '1rem' }}>
              <div style={{ textAlign: 'center', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--border-radius-sm)' }}><div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-gold)' }}>{aiStats.activeRules}</div><div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Regras Ativas</div></div>
              <div style={{ textAlign: 'center', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--border-radius-sm)' }}><div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-gold)' }}>{aiStats.totalApplications}</div><div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Aplicações</div></div>
              <div style={{ textAlign: 'center', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--border-radius-sm)' }}><div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-gold)' }}>{aiStats.totalRules}</div><div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total</div></div>
            </div>
            <table className="data-table">
              <thead><tr><th>Palavra-chave</th><th>Categoria</th><th>Uso</th><th>Status</th><th>Ações</th></tr></thead>
              <tbody>
                {aiRules.map(rule => (
                  <tr key={rule.id}>
                    <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.85rem' }}>{rule.keyword}</td>
                    <td>{rule.categories?.icon} {rule.categories?.name}</td>
                    <td>{rule.usage_count}x</td>
                    <td><button onClick={() => toggleRule(rule)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><span className={`badge ${rule.is_active ? 'badge-success' : 'badge-info'}`}>{rule.is_active ? '✅ Ativa' : '⏸️ Pausa'}</span></button></td>
                    <td><button className="btn-icon" onClick={() => deleteRule(rule.id)}><Trash2 size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'integrations' && <div className="card"><h2>Integrações externas</h2><p>Google Calendar, WhatsApp e novas conexões Open Finance ainda não estão habilitados neste piloto. Não há sincronização automática nem envio de lembretes por esses canais.</p><p>Use importação de extratos, conferência dos movimentos e agenda de contas fixas dentro do Lume.</p></div>}

      {activeTab === 'audit' && tabReady && (
        <div className="card">
          <div className="card-header"><h3 className="card-title">📋 Registro de Atividade</h3></div>
          {auditLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
              Nenhuma atividade registrada ainda. Ações como importações, edições e atualizações de perfil aparecerão aqui automaticamente.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {auditLogs.map((log, i) => (
                <div key={log.id || i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '1.25rem' }}>{log.icon || '📋'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.85rem' }}>{log.details || log.action}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(log.created_at).toLocaleString('pt-BR')}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

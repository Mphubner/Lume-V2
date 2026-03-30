import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { formatCurrency } from '../../utils/format';
import calendarService from '../../services/calendarService';
import { Save, Trash2, Plus, Edit3, Users, CreditCard, Settings as SettingsIcon, Calendar, Building2 } from 'lucide-react';

export default function SettingsPage() {
  const { profile, user, refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
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
  const [accountForm, setAccountForm] = useState({ name: '', type: 'checking', account_type: 'personal', institution: '', balance: '0', credit_limit: '', closing_day: '', due_day: '', color: '#d4a843', icon: '🏦' });
  const [saving, setSaving] = useState(false);
  const [syncingCalendar, setSyncingCalendar] = useState(false);
  const [familyData, setFamilyData] = useState({ hasFamily: false, members: [], families: [], businesses: [] });
  const [showFamilyModal, setShowFamilyModal] = useState(false);
  const [familyForm, setFamilyForm] = useState({ name: '', email: '', password: '', role: 'member', entity_id: '' });
  const [showEntityModal, setShowEntityModal] = useState(false);
  const [entityForm, setEntityForm] = useState({ name: '' });

  const isGrantedMember = profile?.plan_status === 'granted';

  useEffect(() => {
    if (profile) {
      setProfileForm({
        full_name: profile.full_name || '', phone: profile.phone || '', cpf: profile.cpf || '',
        cep: profile.cep || '', street: profile.street || '', street_number: profile.street_number || '',
        complement: profile.complement || '', neighborhood: profile.neighborhood || '', city: profile.city || '', state: profile.state || '',
      });
    }
  }, [profile]);

  useEffect(() => {
    if (activeTab === 'ai') loadAIRules();
    if (activeTab === 'preferences') { loadCategories(); loadAccounts(); }
    if (activeTab === 'family') loadFamily();
  }, [activeTab]);

  const loadAIRules = async () => {
    try { const result = await api.getAIRules(); setAiRules(result.rules || []); setAiStats(result.stats || aiStats); } catch {
      setAiRules([
        { id: '1', keyword: 'SUPERMERCADO', categories: { name: 'Alimentação', icon: '🍔' }, is_active: true, usage_count: 56 },
        { id: '2', keyword: 'UBER', categories: { name: 'Transporte', icon: '🚗' }, is_active: true, usage_count: 38 },
        { id: '3', keyword: 'NETFLIX', categories: { name: 'Lazer', icon: '🎮' }, is_active: true, usage_count: 12 },
        { id: '4', keyword: 'FARMACIA', categories: { name: 'Saúde', icon: '💊' }, is_active: true, usage_count: 22 },
        { id: '5', keyword: 'RESTAURANTE', categories: { name: 'Alimentação', icon: '🍔' }, is_active: true, usage_count: 44 },
        { id: '6', keyword: 'IFOOD', categories: { name: 'Alimentação', icon: '🍔' }, is_active: true, usage_count: 67 },
      ]);
      setAiStats({ activeRules: 6, totalApplications: 239, totalRules: 6 });
    }
  };
  const loadCategories = async () => {
    try { const result = await api.getCategories(); setCategories(result || []); } catch {}
  };
  const loadAccounts = async () => {
    try { const result = await api.getAccounts(); setAccounts(result || []); } catch {
      setAccounts([
        { id: '1', name: 'Nubank', type: 'checking', institution: 'Nubank', balance: 3240, color: '#8b5cf6', icon: '🟣' },
        { id: '2', name: 'Itaú CC', type: 'checking', institution: 'Itaú', balance: 1500, color: '#f97316', icon: '🟠' },
        { id: '3', name: 'Nubank Cartão', type: 'credit_card', institution: 'Nubank', credit_limit: 8000, closing_day: 3, due_day: 10, color: '#8b5cf6', icon: '💳' },
      ]);
    }
  };

  const loadFamily = async () => {
    try {
      const result = await api.getFamily();
      setFamilyData({
        hasFamily: result.hasFamily,
        members: result.members || [],
        families: result.families || [],
        businesses: result.businesses || [],
      });
    } catch (err) { console.error(err); }
  };

  const createFamilyMember = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...familyForm };
      if (!payload.entity_id) delete payload.entity_id; // Let backend use default family
      await api.createFamilyMember(payload);
      setShowFamilyModal(false);
      setFamilyForm({ name: '', email: '', password: '', role: 'member', entity_id: '' });
      alert('Membro adicionado com sucesso!');
      loadFamily();
    } catch (err) {
      alert(err.message || 'Erro ao criar usuário.');
    } finally {
      setSaving(false);
    }
  };

  const createEntity = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createEntity({ name: entityForm.name, type: 'business' });
      setShowEntityModal(false);
      setEntityForm({ name: '' });
      alert('Empresa cadastrada com sucesso!');
      loadFamily();
    } catch (err) {
      alert(err.message || 'Erro ao cadastrar empresa.');
    } finally {
      setSaving(false);
    }
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
    try { await api.deleteAIRule(id); loadAIRules(); } catch {}
  };
  const toggleRule = async (rule) => {
    try { await api.updateAIRule(rule.id, { is_active: !rule.is_active }); loadAIRules(); } catch {}
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
      setNewCat({ name: '', icon: '📦', type: 'expense', color: '#6366f1' }); 
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
    setNewCat({ name: '', icon: '📦', type: 'expense', color: '#6366f1' });
    setShowCatModal(true);
  };

  const openEditCategory = (cat) => {
    if (cat.is_system) {
       alert("Categorias do sistema não podem ser editadas para preservar a inteligência da plataforma.");
       return;
    }
    setEditingCategory(cat);
    setNewCat({ name: cat.name, icon: cat.icon || '📦', type: cat.type || 'expense', color: cat.color || '#6366f1' });
    setShowCatModal(true);
  };

  const createAccount = async (e) => {
    e.preventDefault();
    try {
      await api.createAccount({ ...accountForm, balance: parseFloat(accountForm.balance || 0), credit_limit: accountForm.credit_limit ? parseFloat(accountForm.credit_limit) : null, closing_day: accountForm.closing_day ? parseInt(accountForm.closing_day) : null, due_day: accountForm.due_day ? parseInt(accountForm.due_day) : null });
      setShowAccountModal(false); loadAccounts();
    } catch (err) { alert('Erro: ' + err.message); }
  };
  const deleteAccount = async (id) => { if (confirm('Excluir esta conta?')) { try { await api.deleteAccount(id); loadAccounts(); } catch {} } };

  const allEntities = [...familyData.families, ...familyData.businesses];

  const TABS = [
    { key: 'profile', label: '👤 Perfil' },
    { key: 'preferences', label: '⚙️ Contas e Categorias' },
    ...(!isGrantedMember ? [{ key: 'subscription', label: '💳 Assinatura' }] : []),
    { key: 'family', label: '👥 Espaços & Equipe' },
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
        </div>
      )}

      {/* PREFERENCES TAB - Accounts & Categories */}
      {activeTab === 'preferences' && (
        <div>
          {/* Accounts */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <h3 className="card-title">🏦 Minhas Contas</h3>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAccountModal(true)}><Plus size={14} /> Nova Conta</button>
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
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{acc.type === 'credit_card' ? `Limite: ${formatCurrency(acc.credit_limit)}` : formatCurrency(acc.balance)}</div>
                    </div>
                    <button className="btn-icon" onClick={() => deleteAccount(acc.id)}><Trash2 size={14} /></button>
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {categories.map(cat => (
                <button 
                  key={cat.id} 
                  onClick={() => openEditCategory(cat)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.375rem 0.75rem', borderRadius: 'var(--border-radius-full)', background: 'var(--bg-secondary)', fontSize: '0.85rem', border: `1px solid ${cat.color || 'var(--border-color)'}`, cursor: 'pointer' }}
                >
                  {cat.icon} {cat.name}
                  {cat.is_system && <span className="badge badge-info" style={{ padding: '0 0.25rem', fontSize: '0.6rem' }}>sistema</span>}
                  {!cat.is_system && <Edit3 size={12} style={{ opacity: 0.5, marginLeft: '0.25rem' }}/>}
                </button>
              ))}
            </div>
          </div>

          {/* Account Modal */}
          {showAccountModal && (
            <div className="modal-overlay" onClick={() => setShowAccountModal(false)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header"><h2>🏦 Nova Conta</h2><button onClick={() => setShowAccountModal(false)} style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: '1.25rem' }}>✕</button></div>
                <form onSubmit={createAccount}>
                  <div className="modal-body">
                    <div className="form-row"><div className="form-group"><label>Nome *</label><input value={accountForm.name} onChange={e => setAccountForm({ ...accountForm, name: e.target.value })} placeholder="Nubank, Itaú..." required /></div><div className="form-group"><label>Instituição</label><input value={accountForm.institution} onChange={e => setAccountForm({ ...accountForm, institution: e.target.value })} placeholder="Nubank" /></div></div>
                    <div className="form-row">
                      <div className="form-group"><label>Tipo</label><select value={accountForm.type} onChange={e => setAccountForm({ ...accountForm, type: e.target.value })}><option value="checking">Conta Corrente</option><option value="savings">Poupança</option><option value="credit_card">Cartão de Crédito</option><option value="investment">Investimento</option><option value="wallet">Carteira</option></select></div>
                      <div className="form-group"><label>Titularidade</label><select value={accountForm.account_type} onChange={e => setAccountForm({ ...accountForm, account_type: e.target.value })}><option value="personal">Pessoal (Usuário)</option><option value="business">Empresarial (PJ/Empresa)</option></select></div>
                      <div className="form-group"><label>{accountForm.type === 'credit_card' ? 'Limite' : 'Saldo Atual'} (R$)</label><input type="number" step="0.01" value={accountForm.type === 'credit_card' ? accountForm.credit_limit : accountForm.balance} onChange={e => setAccountForm({ ...accountForm, [accountForm.type === 'credit_card' ? 'credit_limit' : 'balance']: e.target.value })} /></div>
                    </div>
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

      {/* SUBSCRIPTION TAB */}
      {activeTab === 'subscription' && (
        <div className="card" style={{ maxWidth: 650 }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <span className="badge badge-success" style={{ fontSize: '1rem', padding: '0.5rem 1.25rem' }}>💎 {profile?.plan === 'family' ? 'Plano Família' : profile?.plan === 'individual' ? 'Plano Individual' : 'Plano Gratuito'}</span>
            <div style={{ marginTop: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Status: {profile?.plan_status === 'granted' ? '🎁 Acesso Concedido' : profile?.plan_status === 'active' ? '✅ Ativo' : profile?.plan_status === 'trial' ? '⏰ Trial' : 'Inativo'}</div>
          </div>
          <div className="grid grid-2" style={{ gap: '1rem' }}>
            {[
              { id: 'free', name: 'Gratuito', price: 'R$ 0', features: ['1 conta', 'Até 50 transações/mês', 'Categorias básicas'] },
              { id: 'individual', name: 'Individual', price: 'R$ 19,90/mês', features: ['Contas ilimitadas', 'Transações ilimitadas', 'IA completa', 'Importação de extratos'] },
              { id: 'family', name: 'Família', price: 'R$ 39,90/mês', features: ['Tudo do Individual', 'Até 5 membros da família', 'Múltiplos Workspaces'] },
            ].map(plan => (
              <div key={plan.name} style={{ padding: '1.5rem', background: 'var(--bg-secondary)', borderRadius: 'var(--border-radius-md)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: '1.125rem', marginBottom: '0.25rem' }}>{plan.name}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-gold)', marginBottom: '1rem' }}>{plan.price}</div>
                {plan.features.map((f, i) => <div key={i} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>✅ {f}</div>)}
                {profile?.plan !== plan.id && plan.id !== 'free' && (
                  <button className="btn btn-primary" style={{ marginTop: '1rem', width: '100%' }} onClick={() => window.location.href = `/checkout?plan=${plan.id}`}>Assinar {plan.name}</button>
                )}
                {profile?.plan === plan.id && (
                  <button className="btn btn-secondary" style={{ marginTop: '1rem', width: '100%' }} disabled>Plano Atual</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FAMILY / SPACES TAB */}
      {activeTab === 'family' && (
        <div style={{ maxWidth: 750 }}>
          {/* Current User Card */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--accent-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--text-dark)' }}>{(profile?.full_name || 'U')[0]}</div>
              <div><div style={{ fontWeight: 600 }}>{profile?.full_name || 'Você'}</div><div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user?.email} • {isGrantedMember ? 'Membro Convidado' : 'Admin / Dono'}</div></div>
              <span className={`badge ${isGrantedMember ? 'badge-info' : 'badge-success'}`} style={{ marginLeft: 'auto' }}>{isGrantedMember ? '👤 Membro' : '👑 Owner'}</span>
            </div>
          </div>

          {/* ---- FAMILY ENTITIES ---- */}
          {familyData.families.map(fam => (
            <div key={fam.id} className="card" style={{ marginBottom: '1.5rem' }}>
              <div className="card-header">
                <h3 className="card-title"><Users size={18} /> {fam.name || 'Minha Família'}</h3>
                {!isGrantedMember && <button className="btn btn-primary btn-sm" onClick={() => { setFamilyForm({ ...familyForm, entity_id: fam.id }); setShowFamilyModal(true); }}><Plus size={14} /> Novo Membro</button>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {(fam.members || []).map((member, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-sm)' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: member.role === 'owner' ? 'var(--accent-gold)' : 'var(--bg-modifier-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: member.role === 'owner' ? 'var(--text-dark)' : 'inherit' }}>{(member.name || 'U')[0]}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{member.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{member.email}</div>
                    </div>
                    <span className={`badge ${member.role === 'owner' ? 'badge-success' : 'badge-info'}`}>{member.role === 'owner' ? '👑 Owner' : 'member'}</span>
                  </div>
                ))}
                {(!fam.members || fam.members.length === 0) && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>Nenhum membro vinculado.</p>}
              </div>
            </div>
          ))}

          {/* No family yet — prompt */}
          {familyData.families.length === 0 && !isGrantedMember && (
            <div className="card" style={{ marginBottom: '1.5rem', textAlign: 'center', padding: '2rem' }}>
              <Users size={32} style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>Nenhuma família criada ainda.<br/>Convide familiares para compartilhar a gestão financeira.</p>
              <button className="btn btn-primary" onClick={() => { setFamilyForm({ ...familyForm, entity_id: '' }); setShowFamilyModal(true); }}><Plus size={16} /> Adicionar Primeiro Membro</button>
            </div>
          )}

          {/* ---- BUSINESS ENTITIES ---- */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', marginTop: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Building2 size={20} /> Minhas Empresas</h3>
            {!isGrantedMember && <button className="btn btn-primary btn-sm" onClick={() => setShowEntityModal(true)}><Plus size={14} /> Nova Empresa</button>}
          </div>

          {familyData.businesses.map(biz => (
            <div key={biz.id} className="card" style={{ marginBottom: '1rem' }}>
              <div className="card-header">
                <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Building2 size={16} color="var(--accent-gold)" /> {biz.name}</h3>
                {!isGrantedMember && <button className="btn btn-secondary btn-sm" onClick={() => { setFamilyForm({ ...familyForm, entity_id: biz.id }); setShowFamilyModal(true); }}><Plus size={14} /> Membro</button>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {(biz.members || []).map((member, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-sm)' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-modifier-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>{(member.name || 'U')[0]}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{member.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{member.email}</div>
                    </div>
                    <span className={`badge ${member.role === 'owner' ? 'badge-success' : 'badge-info'}`}>{member.role}</span>
                  </div>
                ))}
                {(!biz.members || biz.members.length === 0) && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '0.75rem' }}>Nenhum membro.</p>}
              </div>
            </div>
          ))}

          {familyData.businesses.length === 0 && !isGrantedMember && (
            <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
              <Building2 size={32} style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>Nenhuma empresa cadastrada.<br/>Cadastre sua empresa para separar finanças pessoais e empresariais.</p>
              <button className="btn btn-primary" onClick={() => setShowEntityModal(true)}><Plus size={16} /> Cadastrar Empresa</button>
            </div>
          )}

          {/* ---- MODALS ---- */}
          {/* Add Member Modal */}
          {showFamilyModal && (
            <div className="modal-overlay" onClick={() => setShowFamilyModal(false)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header"><h2>👥 Novo Membro</h2><button onClick={() => setShowFamilyModal(false)} style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: '1.25rem' }}>✕</button></div>
                <form onSubmit={createFamilyMember}>
                  <div className="modal-body">
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>Crie as credenciais de acesso para a pessoa que poderá acessar e lançar movimentações.</p>
                    {allEntities.length > 1 && (
                      <div className="form-group">
                        <label>Adicionar em qual espaço? *</label>
                        <select value={familyForm.entity_id} onChange={e => setFamilyForm({ ...familyForm, entity_id: e.target.value })}>
                          <option value="">Família (padrão)</option>
                          {allEntities.map(ent => (
                            <option key={ent.id} value={ent.id}>{ent.type === 'business' ? `🏢 ${ent.name}` : `👥 ${ent.name}`}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="form-group"><label>Nome Completo *</label><input value={familyForm.name} onChange={e => setFamilyForm({ ...familyForm, name: e.target.value })} required /></div>
                    <div className="form-group"><label>E-mail de Login *</label><input type="email" value={familyForm.email} onChange={e => setFamilyForm({ ...familyForm, email: e.target.value })} required /></div>
                    <div className="form-row">
                      <div className="form-group"><label>Senha Provisória *</label><input type="text" value={familyForm.password} onChange={e => setFamilyForm({ ...familyForm, password: e.target.value })} placeholder="Crie uma senha forte" required minLength={6} /></div>
                      <div className="form-group"><label>Permissão</label><select value={familyForm.role} onChange={e => setFamilyForm({ ...familyForm, role: e.target.value })}><option value="member">Membro (Colaborador)</option><option value="owner">Co-Administrador</option></select></div>
                    </div>
                  </div>
                  <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setShowFamilyModal(false)}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Criando...' : 'Criar Acesso'}</button></div>
                </form>
              </div>
            </div>
          )}

          {/* Create Entity/Business Modal */}
          {showEntityModal && (
            <div className="modal-overlay" onClick={() => setShowEntityModal(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                <div className="modal-header"><h2>🏢 Nova Empresa</h2><button onClick={() => setShowEntityModal(false)} style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: '1.25rem' }}>✕</button></div>
                <form onSubmit={createEntity}>
                  <div className="modal-body">
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>Cadastre uma empresa para separar as finanças PJ das pessoais. Você poderá importar extratos em nome dela e convidar colaboradores.</p>
                    <div className="form-group"><label>Nome da Empresa *</label><input value={entityForm.name} onChange={e => setEntityForm({ ...entityForm, name: e.target.value })} placeholder="Ex: Ateliê, Consultoria ABC..." required /></div>
                  </div>
                  <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setShowEntityModal(false)}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Criando...' : 'Cadastrar Empresa'}</button></div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI TAB */}
      {activeTab === 'ai' && (
        <div>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div><h3 style={{ fontWeight: 600 }}>💬 Lume no WhatsApp</h3><p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Envie comprovantes, áudios ou texto para lançar transações</p></div>
              <button className="btn btn-primary" onClick={() => alert('Integração com WhatsApp será liberada na próxima fase de expansão!')}>🟢 Conectar WhatsApp</button>
            </div>
            <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: 'var(--border-radius-sm)', fontSize: '0.85rem' }}>💡 Exemplos: "Lança R$50 de almoço" • "Quanto gastei em transporte?" • Envie foto de comprovante</div>
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

      {/* INTEGRATIONS TAB */}
      {activeTab === 'integrations' && (
        <div className="card" style={{ maxWidth: 650 }}>
          <div className="card-header"><h3 className="card-title"><Calendar size={18} /> Google Calendar</h3></div>
          <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: 'var(--border-radius-sm)', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="24" height="24" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>Sincronização de Contas Fixas</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Adiciona lembretes na sua agenda do Google para os vencimentos e recebimentos do mês.</div>
            </div>
            <button className="btn btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => alert('Configurações de sincronização avançada chegam em breve!')}>⚙️ Configurar</button>
          </div>
          <div style={{ textAlign: 'center', padding: '1rem' }}>
            <button 
              className="btn btn-primary" 
              disabled={syncingCalendar}
              onClick={async () => {
                setSyncingCalendar(true);
                try {
                  const targetDate = new Date();
                  targetDate.setDate(targetDate.getDate() + 2); // Event 2 days from now
                  
                  await calendarService.createEvent({
                    summary: 'Lembrete Lume: Pagar Fatura',
                    description: 'Gerado automaticamente pelo Lume. Acesse: https://lumefin.com.br',
                    start: { dateTime: targetDate.toISOString() },
                    end: { dateTime: new Date(targetDate.getTime() + 60*60*1000).toISOString() }
                  });
                  alert('Sincronizado! Verifique seu Google Calendar.');
                } catch (err) {
                  alert('Erro ao sincronizar: ' + err.message);
                }
                setSyncingCalendar(false);
              }}
            >
              {syncingCalendar ? 'Sincronizando...' : 'Testar Sincronização Agora'}
            </button>
          </div>
        </div>
      )}

      {/* AUDIT TAB */}
      {activeTab === 'audit' && (
        <div className="card">
          <div className="card-header"><h3 className="card-title">📋 Registro de Atividade</h3></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[
              { date: '28/03/2026 00:45', action: 'Login via Google OAuth', icon: '🔐' },
              { date: '27/03/2026 22:30', action: 'Importação de extrato: extrato_nubank.ofx (45 transações)', icon: '📤' },
              { date: '27/03/2026 20:15', action: 'Perfil atualizado: telefone e endereço', icon: '👤' },
              { date: '26/03/2026 14:00', action: 'Score de Saúde Financeira recalculado: 36 (D)', icon: '❤️' },
              { date: '25/03/2026 10:30', action: 'Meta criada: Viagem Europa (R$ 25.000)', icon: '🎯' },
              { date: '24/03/2026 09:00', action: 'Nova conta cadastrada: Nubank Cartão', icon: '💳' },
            ].map((log, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '1.25rem' }}>{log.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.85rem' }}>{log.action}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{log.date}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

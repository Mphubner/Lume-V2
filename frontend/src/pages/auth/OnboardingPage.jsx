import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';
import api from '../../services/api';
import { Sun, User, Building2, CreditCard, ArrowRight, ArrowLeft, Check, PiggyBank, TrendingDown, Wallet, Users, Info } from 'lucide-react';

const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Conta Corrente', icon: '🏦' },
  { value: 'savings', label: 'Poupança', icon: '🐷' },
  { value: 'credit_card', label: 'Cartão de Crédito', icon: '💳' },
  { value: 'investment', label: 'Investimento', icon: '📈' },
  { value: 'wallet', label: 'Carteira', icon: '👛' },
];

const GOALS = [
  { value: 'control', label: 'Controlar meus gastos', icon: <Wallet size={28} />, desc: 'Organizar receitas e despesas do dia a dia' },
  { value: 'debt', label: 'Pagar minhas dívidas', icon: <TrendingDown size={28} />, desc: 'Criar um plano para quitar pendências' },
  { value: 'invest', label: 'Começar a investir', icon: <PiggyBank size={28} />, desc: 'Construir reserva de emergência e investir' },
  { value: 'family', label: 'Organizar finanças da família', icon: <Users size={28} />, desc: 'Gestão compartilhada entre membros da família' },
];

export default function OnboardingPage() {
  const { user, refreshProfile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [billingCycle, setBillingCycle] = useState('monthly'); // monthly | yearly
  const [dbPlans, setDbPlans] = useState([]);

  // Fetch db plans for dynamic loading
  useEffect(() => {
    supabase.from('plans').select('*').eq('is_active', true).order('price').then(({data}) => {
      if(data) setDbPlans(data);
    });
  }, []);

  const [profile, setProfile] = useState({
    fullName: user?.user_metadata?.full_name || user?.user_metadata?.name || '',
    phone: '',
    cpf: '',
  });

  const [account, setAccount] = useState({
    name: '',
    type: 'checking',
    institution: '',
    balance: '',
  });

  const [goal, setGoal] = useState('');
  const [selectedPlan, setSelectedPlan] = useState(''); // Will store stripe_price_id

  const totalSteps = isAdmin ? 3 : 4; 

  const handleNext = () => {
    if (!isAdmin && step === 1 && !selectedPlan) return;
    if ((isAdmin ? step === 1 : step === 2) && !profile.fullName.trim()) return;
    if ((isAdmin ? step === 2 : step === 3) && !account.name.trim()) return;
    if (step < totalSteps) setStep(step + 1);
    else handleComplete();
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      await api.updateProfile({
        full_name: profile.fullName,
        phone: profile.phone || null,
        cpf: profile.cpf || null,
        onboarding_completed: true,
      });

      if (account.name) {
        await api.createAccount({
          name: account.name,
          type: account.type,
          institution: account.institution || null,
          balance: parseFloat(account.balance) || 0,
        });
      }

      const isFree = selectedPlan === 'free' || !dbPlans.find(p => p.id === selectedPlan)?.price;

      if (!isAdmin && selectedPlan && !isFree) {
        await refreshProfile();
        navigate(`/checkout?plan=${selectedPlan}`);
        return;
      }

      await refreshProfile();
      navigate('/dashboard');
    } catch (err) {
      console.error('Onboarding error:', err);
      navigate('/dashboard');
    }
  };

  const canAdvance = () => {
    if (!isAdmin && step === 1) return !!selectedPlan;
    if ((isAdmin ? step === 1 : step === 2)) return profile.fullName.trim().length >= 2;
    if ((isAdmin ? step === 2 : step === 3)) return account.name.trim().length >= 1;
    if ((isAdmin ? step === 3 : step === 4)) return !!goal;
    return true;
  };

  // UI rendering switch
  const renderBillingToggle = () => (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2.5rem' }}>
      <div style={{ 
        display: 'flex', background: 'var(--bg-input)', padding: '0.25rem', 
        borderRadius: 'var(--border-radius-full)', border: '1px solid var(--border-color)', gap: '0.25rem' 
      }}>
        <button 
          onClick={() => setBillingCycle('monthly')}
          style={{ 
            padding: '0.6rem 1.75rem', borderRadius: 'var(--border-radius-full)', 
            background: billingCycle === 'monthly' ? 'var(--bg-card-hover)' : 'transparent',
            color: billingCycle === 'monthly' ? 'var(--accent-gold)' : 'var(--text-secondary)',
            fontWeight: billingCycle === 'monthly' ? 600 : 500, fontSize: '0.9rem',
            border: billingCycle === 'monthly' ? '1px solid var(--accent-gold)' : '1px solid transparent',
            transition: 'all 0.2s',
          }}
        >
          Mensal
        </button>
        <button 
          onClick={() => setBillingCycle('yearly')}
          style={{ 
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.6rem 1.75rem', borderRadius: 'var(--border-radius-full)', 
            background: billingCycle === 'yearly' ? 'var(--bg-card-hover)' : 'transparent',
            color: billingCycle === 'yearly' ? 'var(--accent-gold)' : 'var(--text-secondary)',
            fontWeight: billingCycle === 'yearly' ? 600 : 500, fontSize: '0.9rem',
            border: billingCycle === 'yearly' ? '1px solid var(--accent-gold)' : '1px solid transparent',
            transition: 'all 0.2s',
          }}
        >
          Anual <span style={{ background: 'var(--color-success)', color: '#09090b', padding: '0.1rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>2 meses grátis</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="auth-page">
      <div className="auth-bg-pattern" />
      <div className="onboarding-container" style={{ maxWidth: step === 1 && !isAdmin ? '900px' : '800px' }}>
        
        {/* Progress Header */}
        <div className="onboarding-header" style={{ padding: '1.5rem 2rem' }}>
          <div className="auth-logo-small" style={{ margin: 0 }}><Sun size={24} strokeWidth={1.5} /><span>Lume</span></div>
          <div className="onboarding-progress">
            {Array.from({ length: totalSteps }, (_, i) => {
              const label = isAdmin 
                ? ['Perfil', 'Conta', 'Objetivo'][i] 
                : ['Plano', 'Perfil', 'Conta', 'Objetivo'][i];
              return (
                <div key={i} className={`progress-step ${i + 1 <= step ? 'active' : ''} ${i + 1 < step ? 'completed' : ''}`}>
                  <div className="progress-dot">{i + 1 < step ? <Check size={14} /> : i + 1}</div>
                  <span>{label}</span>
                </div>
              );
            })}
            <div className="progress-line">
              <div className="progress-fill" style={{ width: `${((step - 1) / (totalSteps - 1)) * 100}%` }} />
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="onboarding-content" style={{ padding: step === 1 && !isAdmin ? '2rem' : '3rem', margin: '0 auto', width: '100%' }}>
          
          {/* STEP 1: PLAN SELECTION (If not admin) */}
          {!isAdmin && step === 1 && (
            <div className="onboarding-step" key="step1">
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '2.2rem', fontWeight: 800, marginBottom: '0.5rem' }}>Escolha seu Plano</h2>
                <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>Selecione o plano ideal para suas necessidades</p>
              </div>

              {renderBillingToggle()}

              <div className="onboarding-plans-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
                {dbPlans.filter(p => p.price > 0).map((p, idx) => {
                  const isPopular = p.name.toLowerCase().includes('individual');
                  const finalPrice = billingCycle === 'yearly' ? (p.price * 10 / 12) : p.price;
                  
                  return (
                    <div key={p.id} className={`plan-card ${selectedPlan === p.id ? 'active' : ''}`} 
                        onClick={() => setSelectedPlan(p.id)}
                        style={{ border: selectedPlan === p.id ? '2px solid var(--accent-gold)' : '1px solid var(--border-color)' }}>
                      {isPopular && <div className="plan-badge" style={{ right: 'auto', left: '50%', transform: 'translateX(-50%)', top: '-14px', borderRadius: '4px', padding: '4px 16px' }}>POPULAR</div>}
                      
                      <h3 style={{ fontSize: '1.5rem' }}>{p.name}</h3>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.5rem', minHeight: '40px' }}>
                        Ideal para controle completo. Inclui todos os benefícios premium.
                      </p>
                      
                      <div className="plan-price">
                        <span className="price-currency">R$</span>
                        <span className="price-value">{finalPrice.toFixed(0)}</span>
                        <span className="price-period">/mês{billingCycle === 'yearly' ? '*' : ''}</span>
                      </div>
                      
                      <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                        <div style={{ color: 'var(--color-success)', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <Check size={14}/> 14 dias grátis para testar
                        </div>
                      </div>

                      <ul className="plan-features">
                        {p.features?.map((f, i) => <li key={i}><Check size={16} /> {f}</li>)}
                      </ul>
                      
                      <button 
                        className="btn btn-primary" 
                        style={{ width: '100%', marginTop: '2rem', padding: '0.8rem', background: selectedPlan === p.id ? 'var(--accent-gold)' : 'var(--bg-secondary)', color: selectedPlan === p.id ? '#111' : 'var(--text-primary)' }}
                        onClick={(e) => { e.stopPropagation(); setSelectedPlan(p.id); handleNext(); }}
                      >
                        Assinar <ArrowRight size={16}/>
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Free Note */}
              <div style={{ 
                marginTop: '3rem', padding: '1.5rem', background: 'var(--bg-input)', border: '1px solid var(--border-color)', 
                borderRadius: 'var(--border-radius-lg)', textAlign: 'center' 
              }}>
                <div style={{ color: 'var(--text-primary)', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                   <Info size={18} color="var(--accent-gold)"/> 14 dias grátis
                </div>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  Cadastre seu cartão e <strong style={{ color: 'var(--accent-gold)' }}>teste por 14 dias sem cobrança</strong>. Se não gostar, cancele antes do fim do trial e não será cobrado nada. Os planos pagos contam com Inteligência Artificial avançada.
                </p>
              </div>

            </div>
          )}

          {/* STEP 2: PROFILE (or Step 1 for Admin) */}
          {(isAdmin ? step === 1 : step === 2) && (
            <div className="onboarding-step" key="profile">
               <h2 style={{ fontSize: '1.8rem' }}>👋 Bem-vindo ao Lume!</h2>
              <p>Vamos configurar seu perfil pessoal para começarmos.</p>
              <div className="onboarding-fields" style={{ marginTop: '1rem' }}>
                <div className="auth-field">
                  <User size={18} className="auth-field-icon" />
                  <input type="text" placeholder="Nome completo *" value={profile.fullName} onChange={e => setProfile({ ...profile, fullName: e.target.value })} autoFocus />
                </div>
                <div className="auth-field">
                  <span className="auth-field-icon" style={{ fontSize: '14px' }}>📱</span>
                  <input type="tel" placeholder="Telefone com DDD (opcional)" value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} />
                </div>
                <div className="auth-field">
                  <CreditCard size={18} className="auth-field-icon" />
                  <input type="text" placeholder="CPF (opcional para notas)" value={profile.cpf} onChange={e => setProfile({ ...profile, cpf: e.target.value })} />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: ACCOUNT (or Step 2 for Admin) */}
          {(isAdmin ? step === 2 : step === 3) && (
            <div className="onboarding-step" key="account">
              <h2 style={{ fontSize: '1.8rem' }}>🏦 Sua primeira conta</h2>
              <p>Adicione onde você movimenta seu dinheiro para acompanharmos juntos.</p>
              <div className="onboarding-fields" style={{ marginTop: '1rem' }}>
                <div className="auth-field">
                  <Building2 size={18} className="auth-field-icon" />
                  <input type="text" placeholder="Apelido da conta (ex: Nubank) *" value={account.name} onChange={e => setAccount({ ...account, name: e.target.value })} autoFocus />
                </div>
                <div className="onboarding-type-grid">
                  {ACCOUNT_TYPES.map(t => (
                    <button key={t.value} className={`type-card ${account.type === t.value ? 'active' : ''}`} onClick={() => setAccount({ ...account, type: t.value })}>
                      <span>{t.icon}</span>
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>
                <div className="auth-field">
                  <span className="auth-field-icon" style={{ fontSize: '14px' }}>R$</span>
                  <input type="number" placeholder="Saldo atual (opcional)" value={account.balance} onChange={e => setAccount({ ...account, balance: e.target.value })} step="0.01" />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: GOAL (or Step 3 for Admin) */}
          {(isAdmin ? step === 3 : step === 4) && (
             <div className="onboarding-step" key="goal">
             <h2 style={{ fontSize: '1.8rem' }}>🎯 Qual seu objetivo principal?</h2>
             <p>A inteligência da Lume vai guiar você com base nessa escolha.</p>
             <div className="onboarding-goals-grid" style={{ marginTop: '1rem' }}>
               {GOALS.map(g => (
                 <button key={g.value} className={`goal-card ${goal === g.value ? 'active' : ''}`} onClick={() => { setGoal(g.value); setTimeout(() => handleNext(), 300); }}>
                   <div className="goal-icon">{g.icon}</div>
                   <strong>{g.label}</strong>
                   <span>{g.desc}</span>
                 </button>
               ))}
             </div>
           </div>
          )}
        </div>

        {/* Navigation Footer */}
        <div className="onboarding-nav" style={{ display: (!isAdmin && step === 1) ? 'none' : 'flex' }}>
          {step > 1 && (
            <button className="btn btn-secondary" onClick={handleBack}><ArrowLeft size={18} /> Voltar</button>
          )}
          <div style={{ flex: 1 }} />
          <button className="auth-submit-btn" onClick={handleNext} disabled={!canAdvance() || loading} style={{ width: 'auto', minWidth: 200, margin: 0 }}>
            {loading ? <span className="spinner" style={{ width: 20, height: 20 }} /> : (
              <>
                <span>{step === totalSteps ? 'Finalizar Configuração' : 'Próximo Passo'}</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}

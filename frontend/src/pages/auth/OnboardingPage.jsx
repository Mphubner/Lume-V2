import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { Sun, User, Building2, Target, CreditCard, ArrowRight, ArrowLeft, Check, PiggyBank, TrendingDown, Wallet, Users } from 'lucide-react';

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

const PLANS = [
  {
    id: 'free', name: 'Free', price: 0, period: '',
    features: ['1 conta bancária', 'Até 50 lançamentos/mês', 'Dashboard básico', 'Categorias padrão'],
    highlight: false,
  },
  {
    id: 'individual', name: 'Individual', price: 19.90, period: '/mês',
    features: ['Contas ilimitadas', 'Lançamentos ilimitados', 'IA para categorização', 'Importação de extratos', 'Metas e orçamentos', 'Relatórios avançados', 'Google Calendar sync'],
    highlight: true,
  },
  {
    id: 'family', name: 'Família', price: 39.90, period: '/mês',
    features: ['Tudo do Individual', 'Até 5 membros', 'Visão consolidada', 'Controle por membro', 'Suporte prioritário'],
    highlight: false,
  },
];

export default function OnboardingPage() {
  const { user, refreshProfile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

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
  const [selectedPlan, setSelectedPlan] = useState('free');

  const totalSteps = isAdmin ? 3 : 4; // Admin skips plan selection

  const handleNext = () => {
    if (step === 1 && !profile.fullName.trim()) return;
    if (step === 2 && !account.name.trim()) return;
    if (step === 3 && !goal) return;
    if (step < totalSteps) setStep(step + 1);
    else handleComplete();
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      // 1. Update profile
      await api.updateProfile({
        full_name: profile.fullName,
        phone: profile.phone || null,
        cpf: profile.cpf || null,
        onboarding_completed: true,
      });

      // 2. Create first account
      if (account.name) {
        await api.createAccount({
          name: account.name,
          type: account.type,
          institution: account.institution || null,
          balance: parseFloat(account.balance) || 0,
        });
      }

      // 3. If chosen a paid plan and not admin, redirect to checkout
      const plan = isAdmin ? 'family' : selectedPlan;
      if (plan !== 'free' && !isAdmin) {
        // Redirect to checkout with plan info
        await refreshProfile();
        navigate(`/checkout?plan=${plan}`);
        return;
      }

      // 4. Free plan or admin — go to dashboard
      await refreshProfile();
      navigate('/dashboard');
    } catch (err) {
      console.error('Onboarding error:', err);
      // Still navigate — profile might have been partially saved
      navigate('/dashboard');
    }
  };

  const canAdvance = () => {
    if (step === 1) return profile.fullName.trim().length >= 2;
    if (step === 2) return account.name.trim().length >= 1;
    if (step === 3) return !!goal;
    if (step === 4) return !!selectedPlan;
    return true;
  };

  return (
    <div className="auth-page">
      <div className="auth-bg-pattern" />
      <div className="onboarding-container">
        {/* Progress bar */}
        <div className="onboarding-header">
          <div className="auth-logo-small"><Sun size={28} strokeWidth={1.5} /><span>Lume</span></div>
          <div className="onboarding-progress">
            {Array.from({ length: totalSteps }, (_, i) => (
              <div key={i} className={`progress-step ${i + 1 <= step ? 'active' : ''} ${i + 1 < step ? 'completed' : ''}`}>
                <div className="progress-dot">{i + 1 < step ? <Check size={14} /> : i + 1}</div>
                <span>{['Perfil', 'Conta', 'Objetivo', 'Plano'][i]}</span>
              </div>
            ))}
            <div className="progress-line">
              <div className="progress-fill" style={{ width: `${((step - 1) / (totalSteps - 1)) * 100}%` }} />
            </div>
          </div>
        </div>

        {/* Step content */}
        <div className="onboarding-content">
          {step === 1 && (
            <div className="onboarding-step" key="step1">
              <h2>👋 Bem-vindo ao Lume!</h2>
              <p>Vamos configurar seu perfil em poucos passos.</p>
              <div className="onboarding-fields">
                <div className="auth-field">
                  <User size={18} className="auth-field-icon" />
                  <input type="text" placeholder="Nome completo *" value={profile.fullName} onChange={e => setProfile({ ...profile, fullName: e.target.value })} autoFocus />
                </div>
                <div className="auth-field">
                  <span className="auth-field-icon" style={{ fontSize: '14px' }}>📱</span>
                  <input type="tel" placeholder="Telefone (opcional)" value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} />
                </div>
                <div className="auth-field">
                  <CreditCard size={18} className="auth-field-icon" />
                  <input type="text" placeholder="CPF (opcional)" value={profile.cpf} onChange={e => setProfile({ ...profile, cpf: e.target.value })} />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="onboarding-step" key="step2">
              <h2>🏦 Sua primeira conta</h2>
              <p>Adicione sua conta bancária principal.</p>
              <div className="onboarding-fields">
                <div className="auth-field">
                  <Building2 size={18} className="auth-field-icon" />
                  <input type="text" placeholder="Nome da conta (ex: Nubank) *" value={account.name} onChange={e => setAccount({ ...account, name: e.target.value })} autoFocus />
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
                  <Building2 size={18} className="auth-field-icon" />
                  <input type="text" placeholder="Instituição (ex: Nubank, Itaú)" value={account.institution} onChange={e => setAccount({ ...account, institution: e.target.value })} />
                </div>
                <div className="auth-field">
                  <span className="auth-field-icon" style={{ fontSize: '14px' }}>R$</span>
                  <input type="number" placeholder="Saldo atual (opcional)" value={account.balance} onChange={e => setAccount({ ...account, balance: e.target.value })} step="0.01" />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="onboarding-step" key="step3">
              <h2>🎯 Qual seu objetivo principal?</h2>
              <p>Isso nos ajuda a personalizar sua experiência.</p>
              <div className="onboarding-goals-grid">
                {GOALS.map(g => (
                  <button key={g.value} className={`goal-card ${goal === g.value ? 'active' : ''}`} onClick={() => setGoal(g.value)}>
                    <div className="goal-icon">{g.icon}</div>
                    <strong>{g.label}</strong>
                    <span>{g.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 4 && !isAdmin && (
            <div className="onboarding-step" key="step4">
              <h2>💎 Escolha seu plano</h2>
              <p>Comece grátis e faça upgrade quando quiser.</p>
              <div className="onboarding-plans-grid">
                {PLANS.map(p => (
                  <button key={p.id} className={`plan-card ${selectedPlan === p.id ? 'active' : ''} ${p.highlight ? 'highlight' : ''}`} onClick={() => setSelectedPlan(p.id)}>
                    {p.highlight && <div className="plan-badge">Mais popular</div>}
                    <h3>{p.name}</h3>
                    <div className="plan-price">
                      {p.price === 0 ? <span className="price-value">Grátis</span> : (
                        <>
                          <span className="price-currency">R$</span>
                          <span className="price-value">{p.price.toFixed(2).replace('.', ',')}</span>
                          <span className="price-period">{p.period}</span>
                        </>
                      )}
                    </div>
                    <ul className="plan-features">
                      {p.features.map((f, i) => <li key={i}><Check size={14} /> {f}</li>)}
                    </ul>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="onboarding-nav">
          {step > 1 && (
            <button className="btn btn-secondary" onClick={handleBack}><ArrowLeft size={18} /> Voltar</button>
          )}
          <div style={{ flex: 1 }} />
          <button className="auth-submit-btn" onClick={handleNext} disabled={!canAdvance() || loading} style={{ width: 'auto', minWidth: 200 }}>
            {loading ? <span className="spinner" style={{ width: 20, height: 20 }} /> : (
              <>
                <span>{step === totalSteps ? (selectedPlan !== 'free' && !isAdmin ? 'Ir para pagamento' : 'Começar a usar') : 'Próximo'}</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

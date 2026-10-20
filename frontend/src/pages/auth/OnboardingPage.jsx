import { useWorkspace } from '../../context/WorkspaceContext';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { localToday } from '../../utils/finance';

export default function OnboardingPage() {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { workspaces } = useWorkspace();
  const personalWorkspace = workspaces.find(w => w.kind === 'personal' && w.role === 'owner')?.id;
  const [account, setAccount] = useState({ name: '', type: 'checking', institution: '', balance: '', balance_date: localToday() });
  const [objective, setObjective] = useState('control');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const complete = async (event) => {
    event.preventDefault(); setLoading(true); setError(null);
    try {
      await api.request('/profile/onboarding', { method: 'POST', body: { workspace: personalWorkspace, account: { ...account, balance: Number(account.balance) }, objective } });
      await refreshProfile();
      navigate('/importar', { replace: true });
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  return <div className="auth-page"><div className="auth-container auth-container-centered"><div className="card" style={{ maxWidth: 640, width: '100%' }}>
    <h1>Vamos começar pela sua primeira conta</h1>
    <p>Olá, {user?.user_metadata?.full_name || 'bem-vindo'}. Cadastre um saldo de referência antes de importar os movimentos seguintes. Acesso ao piloto não exige cartão.</p>
    <form onSubmit={complete} className="auth-form">
      <label htmlFor="onboard-account">Nome da conta</label>
      <input id="onboard-account" required value={account.name} onChange={e => setAccount({ ...account, name: e.target.value })} placeholder="Ex.: PicPay de Marcos" />
      <label htmlFor="onboard-type">Tipo de conta</label>
      <select id="onboard-type" value={account.type} onChange={e => setAccount({ ...account, type: e.target.value })}>
        <option value="checking">Conta corrente</option><option value="savings">Poupança</option><option value="wallet">Carteira</option><option value="investment">Investimento</option><option value="credit_card">Cartão de crédito</option>
      </select>
      <label htmlFor="onboard-institution">Instituição</label><input id="onboard-institution" value={account.institution} onChange={e => setAccount({ ...account, institution: e.target.value })} />
      <label htmlFor="onboard-balance">Saldo de fechamento na data-base (R$)</label>
      <input id="onboard-balance" required type="number" step="0.01" value={account.balance} onChange={e => setAccount({ ...account, balance: e.target.value })} aria-describedby="balance-help" />
      <label htmlFor="onboard-date">Data-base do saldo</label><input id="onboard-date" required type="date" value={account.balance_date} onChange={e => setAccount({ ...account, balance_date: e.target.value })} />
      <p id="balance-help">Use o saldo ao final desse dia. Movimentos posteriores alteram esse saldo; movimentos anteriores não serão somados novamente. No cartão, dívida é saldo negativo.</p>
      <label htmlFor="onboard-goal">Seu objetivo inicial</label><select id="onboard-goal" value={objective} onChange={e => setObjective(e.target.value)}><option value="control">Conferir saldos e controlar gastos</option><option value="debt">Organizar dívidas</option><option value="reserve">Planejar minha reserva</option><option value="family">Organizar a família</option></select>
      <p>A primeira ação será importar e conferir um extrato. Compartilhamento e empresa podem ser configurados depois em Contextos.</p>
      {error && <div role="alert" className="auth-error">{error} Seu cadastro ainda não foi concluído. Você pode tentar novamente.</div>}
      <button className="btn btn-primary" disabled={loading || !personalWorkspace}>{loading ? 'Salvando…' : 'Salvar conta e conferir primeiro extrato'}</button>
    </form>
  </div></div></div>;
}

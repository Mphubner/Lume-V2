import { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import PlanCatalog from './PlanCatalog';
import DataError from './DataError';

export default function SubscriptionSettings() {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setSubscription(await api.request('/payments/subscription')); }
    catch (e) { setError(e); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const cancel = async () => {
    if (!confirm('Agendar cancelamento para o fim do período pago?')) return;
    setBusy(true);
    try { const result = await api.request('/payments/cancel', { method: 'POST' }); setNotice(result.message); await load(); }
    catch (e) { setError(e); } finally { setBusy(false); }
  };
  const portal = async () => {
    setBusy(true);
    try {
      const result = await api.request('/payments/portal', { method: 'POST' });
      const url = new URL(result.url);
      if (url.protocol !== 'https:' || url.hostname !== 'billing.stripe.com') throw new Error('Endereço de cobrança não reconhecido.');
      window.location.assign(url.href);
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const labels = { active: 'Ativa', trialing: 'Em teste', past_due: 'Pagamento pendente', unpaid: 'Não paga', canceled: 'Cancelada', incomplete: 'Aguardando confirmação', incomplete_expired: 'Confirmação expirada' };
  return <div>
    <div className="card">
      <h2>Sua assinatura</h2>
      {loading ? <p role="status">Consultando situação da cobrança…</p> : error ? <DataError error={error} onRetry={load} /> : subscription ? <>
        <p>Plano: {subscription.plan_id} · {labels[subscription.status] || subscription.status}</p>
        <p>Fim do período: {subscription.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString('pt-BR') : 'Ainda não confirmado'}</p>
        {subscription.cancel_at_period_end && <p role="status">Cancelamento agendado para o fim do período pago.</p>}
        {!['canceled', 'incomplete_expired'].includes(subscription.status) && <div className="page-header-actions"><button className="btn btn-secondary" disabled={busy} onClick={portal}>Gerenciar cobrança</button><button className="btn btn-secondary" disabled={busy || subscription.cancel_at_period_end} onClick={cancel}>Cancelar assinatura</button></div>}
      </> : <p>Nenhuma assinatura registrada. O acesso ao piloto não confirma uma cobrança.</p>}
      {notice && <p role="status">{notice}</p>}
    </div>
    <PlanCatalog />
  </div>;
}

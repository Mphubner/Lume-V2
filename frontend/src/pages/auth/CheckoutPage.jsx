import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { formatCurrency } from '../../utils/format';
export default function CheckoutPage() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const planId = new URLSearchParams(search).get('plan');
  const cycle = new URLSearchParams(search).get('cycle') || 'month';
  const [catalog, setCatalog] = useState(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { api.request('/plans').then(setCatalog).catch(e => setError(e.message)); }, []);
  const plan = catalog?.plans?.find(item => item.id === planId && item.billing_cycle === cycle);
  const checkout = async () => {
    setBusy(true); setError('');
    const key = `lume-checkout:${user.id}:${plan.id}:${cycle}`;
    let idempotencyKey = sessionStorage.getItem(key);
    if (!idempotencyKey) { idempotencyKey = crypto.randomUUID(); sessionStorage.setItem(key, idempotencyKey); }
    try {
      const result = await api.request('/payments/create-subscription', { method: 'POST', body: { planId: plan.id, billingCycle: cycle, idempotencyKey } });
      const url = new URL(result.checkoutUrl);
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error('Endereço de pagamento inválido.');
      window.location.assign(url.toString());
    } catch (e) {
      if (e.code === 'checkout_expired') sessionStorage.removeItem(key);
      if (e.code === 'checkout_completed') navigate('/configuracoes?payment=verify', { replace: true });
      setError(e.message); setBusy(false);
    }
  };
  return <main className="card" style={{ maxWidth: 650, margin: '4rem auto' }}><Link to="/configuracoes">← Configurações</Link><h1>Revisar assinatura</h1>{error && <p role="alert">{error}</p>}{!catalog ? <p role="status">Consultando catálogo…</p> : !catalog.billing_enabled ? <p>A cobrança está desativada durante o piloto. Nenhum cartão será solicitado.</p> : !plan ? <p role="alert">Plano ou ciclo inválido. Escolha uma oferta atual no catálogo.</p> : <><h2>{plan.name}</h2><p>{formatCurrency(plan.price)} por mês, com renovação recorrente.</p><p>Você será direcionado ao checkout do Stripe para revisar os dados e confirmar. O retorno ao Lume, sozinho, não confirma pagamento: consulte a assinatura em Configurações.</p><button className="btn btn-primary" disabled={busy} onClick={checkout}>{busy ? 'Preparando checkout…' : 'Continuar para pagamento'}</button></>}</main>;
}

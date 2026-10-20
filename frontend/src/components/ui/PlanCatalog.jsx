import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { formatCurrency } from '../../utils/format';
export default function PlanCatalog() {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api.request('/plans').then(setCatalog).catch(setError); }, []);
  if (error) return <p role="alert">Catálogo indisponível. Nenhum preço ou pagamento pode ser confirmado agora.</p>;
  if (!catalog) return <p role="status">Carregando catálogo…</p>;
  return <div>{!catalog.billing_enabled && <p className="card">Piloto de validação. A cobrança está desativada neste ambiente.</p>}<div className="grid grid-3">{(catalog.plans || []).map(plan => <div className="card" key={plan.id}>
    <h3>{plan.name}</h3><p style={{ fontSize: '1.5rem' }}>{formatCurrency(plan.price)} / {['year', 'yearly'].includes(plan.billing_cycle) ? 'ano' : 'mês'}</p>
    <ul>{(plan.features || []).map(feature => <li key={feature}>{feature}</li>)}</ul>
    {catalog.billing_enabled && Number(plan.price) > 0 ? <Link className="btn btn-primary" to={`/checkout?plan=${encodeURIComponent(plan.id)}&cycle=${plan.billing_cycle || 'month'}`}>Revisar assinatura</Link> : <Link className="btn btn-secondary" to="/cadastro">Criar acesso ao piloto</Link>}
  </div>)}</div></div>;
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { formatCurrency } from '../../utils/format';
import DataError from '../../components/ui/DataError';

export default function InvestmentsPage() {
  const [accounts, setAccounts] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let active = true;
    api.getAccounts().then(data => { if (active) setAccounts(data.filter(a => a.type === 'investment')); }).catch(e => { if (active) setError(e); });
    return () => { active = false; };
  }, []);
  if (error) return <DataError error={error} onRetry={() => window.location.reload()} />;
  if (!accounts) return <p role="status">Carregando contas de investimento…</p>;
  return <div><div className="page-header"><h1>Contas de investimento</h1><p>Saldos das contas cadastradas. Cotações, rentabilidade e composição por ativo ainda não são calculadas.</p></div>
    <div className="card"><h2>Aplicações e resgates são movimentações entre contas</h2><p>Cadastre uma conta do tipo Investimento, com saldo e data-base. Registre a transferência entre a conta corrente e a conta de investimento em Lançamentos. O valor aplicado não é despesa de consumo; rendimentos e taxas precisam de lançamentos próprios.</p><Link className="btn btn-primary" to="/lancamentos">Registrar transferência</Link> <Link className="btn btn-secondary" to="/configuracoes">Cadastrar conta</Link></div>
    <div className="grid grid-2" style={{ marginTop: '1rem' }}>{accounts.map(account => <div className="card" key={account.id}><h2>{account.name}</h2><p>{account.balance == null ? 'Saldo não confirmado' : formatCurrency(account.balance)}</p><p>Data-base: {account.balance_date || 'não informada'}</p><small>Saldo calculado da conta; não equivale a uma cotação atual de ativos.</small></div>)}</div>
    {!accounts.length && <div className="card"><h2>Nenhuma conta de investimento cadastrada</h2><p>Não há posições ou rendimento confirmado para exibir.</p></div>}
  </div>;
}

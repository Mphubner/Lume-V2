import { useState } from 'react';
import api from '../../services/api';
import { formatCurrency } from '../../utils/format';
import { localToday } from '../../utils/finance';
import BottomSheet from './BottomSheet';

export default function AccountReconciliation({ account, onClose, onSaved }) {
  const [date, setDate] = useState(localToday());
  const [balance, setBalance] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const reconcile = async event => {
    event.preventDefault(); setBusy(true); setError(null); setResult(null);
    try { const value = await api.request(`/accounts/${account.id}/reconcile`, { method: 'POST', body: { as_of: date, expected_balance: Number(balance) } }); setResult(value); onSaved?.(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <BottomSheet title={`Conferir saldo: ${account.name}`} onClose={onClose} isOpen>
    <form onSubmit={reconcile} className="auth-form">
      <p>Informe o saldo de fechamento exibido no extrato. O serviço compara esse valor com o saldo-base e os movimentos revisados, sem criar ajuste automático.</p>
      <label>Data do fechamento<input required type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
      <label>Saldo do extrato (R$)<input required type="number" step="0.01" value={balance} onChange={e => setBalance(e.target.value)} /></label>
      {error && <p role="alert">{error}</p>}
      {result && <div role="status"><p>{result.reconciled ? 'Saldo confere com os movimentos revisados.' : 'Há uma diferença a investigar; o saldo não foi ajustado.'}</p><p>Saldo informado: {formatCurrency(result.expected_balance)} · Calculado: {formatCurrency(result.calculated_balance)}</p>{result.difference != null && <p>Diferença: {formatCurrency(result.difference)}</p>}<p>Fechamento: {result.as_of}. Guarde o extrato como fonte desta conferência.</p></div>}
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Conferindo…' : 'Conferir saldo do extrato'}</button>
    </form>
  </BottomSheet>;
}

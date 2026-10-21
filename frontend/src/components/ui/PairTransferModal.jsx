import { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import BottomSheet from './BottomSheet';
import DataError from './DataError';
import { formatCurrency, formatDate } from '../../utils/format';

export default function PairTransferModal({ transaction, onClose, onSaved }) {
  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const matches = []; let page = 1; let pages = 1;
      do {
        const result = await api.getTransactions({ workspace: transaction.workspace_id, page, limit: 500 });
        matches.push(...result.transactions.filter(row => row.id !== transaction.id && row.account_id !== transaction.account_id && row.workspace_id === transaction.workspace_id && !row.linked_transaction_id && !row.reversal_of && Math.round(Number(row.amount) * 100) === -Math.round(Number(transaction.amount) * 100) && Math.abs(Date.parse(row.date) - Date.parse(transaction.date)) <= 3 * 86400000));
        pages = result.totalPages; page++;
      } while (page <= pages);
      setCandidates(matches);
    } catch (e) { setError(e); } finally { setLoading(false); }
  }, [transaction]);
  useEffect(() => { void load(); }, [load]);
  const pair = async event => {
    event.preventDefault();
    const counterpart = candidates.find(row => row.id === selected);
    if (!counterpart || !confirm('Vincular as duas pernas como movimentação entre contas do mesmo contexto?')) return;
    setBusy(true); setError(null);
    try {
      await api.request('/transactions/transfers/link', { method: 'PATCH', body: { source_transaction_id: Number(transaction.amount) < 0 ? transaction.id : counterpart.id, destination_transaction_id: Number(transaction.amount) > 0 ? transaction.id : counterpart.id } });
      await onSaved(); onClose();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return <BottomSheet isOpen title="Vincular movimentação entre contas" onClose={busy ? () => {} : onClose}>
    <p>{formatDate(transaction.date)} · {transaction.description} · {formatCurrency(transaction.amount)}</p>
    <p>Buscamos em todas as páginas lançamentos já revisados, de outra conta no mesmo contexto, com valor inverso e até três dias de diferença. Confira o extrato: a coincidência sozinha não confirma uma transferência.</p>
    {error && <DataError error={error} onRetry={load} />}
    {loading ? <p role="status">Buscando contrapartes…</p> : <form onSubmit={pair}><label>Contraparte confirmada<select required value={selected} onChange={e => setSelected(e.target.value)}><option value="">Selecione o movimento correspondente</option>{candidates.map(row => <option key={row.id} value={row.id}>{formatDate(row.date)} · {row.accounts?.name || row.account_id} · {row.description} · {formatCurrency(row.amount)}</option>)}</select></label>{!candidates.length && <p>Nenhuma contraparte compatível encontrada. Confira a outra conta e revise seu extrato antes de parear.</p>}<button className="btn btn-primary" disabled={busy || !selected || !!error}>Confirmar pareamento</button></form>}
  </BottomSheet>;
}

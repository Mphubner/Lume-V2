import { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import BottomSheet from '../../components/ui/BottomSheet';
import DataError from '../../components/ui/DataError';
import { formatCurrency, formatDate } from '../../utils/format';

const PAGE_SIZE = 50;
export default function ImportAuditModal({ importId, onClose }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState({});
  const [error, setError] = useState(null);
  const [balance, setBalance] = useState({ opening_balance: '', closing_balance: '', period_start: '', period_end: '', source_confirmed: false });
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [result, cats] = await Promise.all([api.getPendingReconciliation({ import_id: importId, limit: PAGE_SIZE, offset }), api.getCategories()]);
      setRows(result.transactions || []); setTotal(result.total); setCategories(cats);
    } catch (e) { setError(e); } finally { setLoading(false); }
  }, [importId, offset]);
  useEffect(() => { void load(); }, [load]);
  const updateRow = async (row, changes) => {
    setBusy(true);
    try { await api.request(`/import/rows/${row.id}`, { method: 'PATCH', body: changes }); await load(); }
    catch (e) { setError(e); } finally { setBusy(false); }
  };
  const approve = async (event) => {
    event.preventDefault();
    if (!window.confirm(`Aplicar o lote completo de ${total} linhas, após conferir os saldos e resolver duplicidades?`)) return;
    setBusy(true); setError(null);
    try {
      const ids = [];
      for (let start = 0; start < total; start += 200) {
        const page = await api.getPendingReconciliation({ import_id: importId, limit: 200, offset: start });
        if (page.total !== total) throw new Error('O lote mudou durante a revisão. Atualize antes de aplicar.');
        ids.push(...page.transactions.map(row => row.id));
      }
      if (new Set(ids).size !== total) throw new Error('Nem todas as linhas foram carregadas. A aplicação foi cancelada.');
      await api.reconcileAll({ import_id: importId, ids, balance_check: { ...balance, opening_balance: Number(balance.opening_balance), closing_balance: Number(balance.closing_balance) } });
      onClose();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return <BottomSheet isOpen={!!importId} onClose={busy ? () => {} : onClose} title="Conferir e aplicar extrato" maxWidth={1100}>
    <p>As linhas abaixo estão em revisão e ainda não alteram os saldos. Valores e datas da fonte são preservados. Se estiverem errados, corrija a origem e importe novamente.</p>
    {error && <DataError error={error} onRetry={load} />}
    {loading ? <p role="status">Carregando linhas…</p> : <>
      <p role="status">Linhas {total ? offset + 1 : 0}–{Math.min(offset + PAGE_SIZE, total)} de {total}. A aplicação sempre abrange o lote completo.</p>
      <div className="table-responsive"><table className="data-table"><thead><tr><th>Fonte e data</th><th>Interpretação</th><th>Valor</th><th>Categoria / natureza</th><th>Duplicidade</th></tr></thead><tbody>
        {rows.map(row => <tr key={row.id}>
          <td>{formatDate(row.date)}<details><summary>Ver linha original</summary><pre className="source-row">{typeof row.source === 'string' ? row.source : JSON.stringify(row.source || row.raw_data || {}, null, 2)}</pre></details></td>
          <td>{row.description}<small style={{ display: 'block' }}>{row.review_state || 'Pendente'}</small></td>
          <td>{formatCurrency(row.amount_cents != null ? row.amount_cents / 100 : row.amount)}</td>
          <td><label className="sr-only" htmlFor={`cat-${row.id}`}>Categoria de {row.description}</label><select id={`cat-${row.id}`} disabled={busy} value={row.category_id || ''} onChange={e => updateRow(row, { category_id: e.target.value || null })}><option value="">Sem categoria</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <label className="sr-only" htmlFor={`kind-${row.id}`}>Natureza de {row.description}</label><select id={`kind-${row.id}`} disabled={busy} value={row.economic_kind || 'standard'} onChange={e => updateRow(row, { economic_kind: e.target.value })}><option value="standard">Receita / despesa pelo sinal</option><option value="transfer">Transferência entre contas</option><option value="card_payment">Pagamento de cartão</option><option value="refund">Estorno / reembolso</option><option value="investment_principal">Aplicação / resgate</option><option value="loan_principal">Principal de empréstimo</option><option value="owner_contribution">Aporte</option><option value="owner_withdrawal">Retirada</option></select></td>
          <td><button className="btn btn-secondary btn-sm" disabled={busy} onClick={async () => { try { const data = await api.request(`/import/rows/${row.id}/candidates`); setCandidates(previous => ({ ...previous, [row.id]: data })); } catch (e) { setError(e); } }}>Conferir vínculos</button>
          {row.review_state === 'potential_duplicate' && <><p>Possível duplicidade: compare a fonte antes de decidir.</p><button disabled={busy} onClick={() => updateRow(row, { distinct_confirmed: true })}>É um movimento distinto</button></>}
          {row.duplicate_of && <p>Duplicata vinculada; não reaplicar</p>}
          {candidates[row.id] && <div>{candidates[row.id].truncated && <p>Há mais candidatos; refine a conferência antes de decidir.</p>}{[['duplicates','duplicate_of','Já existe neste lançamento'],['transfers','linked_transaction_id','Contraparte da movimentação'],['refunds','reversal_of','Lançamento original do estorno']].map(([group,field,label]) => <label key={group}>{label}<select value={row[field] || ''} disabled={busy} onChange={e => updateRow(row, { [field]: e.target.value || null })}><option value="">Sem vínculo</option>{candidates[row.id][group]?.map(item => <option key={item.id} value={item.id}>{formatDate(item.date)} · {item.accounts?.name} · {item.description} · {formatCurrency(item.amount)}</option>)}</select></label>)}</div>}
          </td>
        </tr>)}
      </tbody></table></div>
      <div className="filter-bar"><button className="btn btn-secondary" disabled={offset === 0 || busy} onClick={() => setOffset(v => Math.max(0, v - PAGE_SIZE))}>Anterior</button><button className="btn btn-secondary" disabled={offset + PAGE_SIZE >= total || busy} onClick={() => setOffset(v => v + PAGE_SIZE)}>Próxima</button></div>
    </>}
    <form onSubmit={approve} className="card" style={{ marginTop: '1rem' }}><h3>Fechamento com a fonte</h3><p>Copie os saldos e o período do extrato. O servidor compara em centavos e bloqueia diferenças. Pagamentos de cartão e transferências precisam de contraparte já confirmada. Se as duas pernas ainda aguardam revisão, aplique inicialmente como padrão e faça o pareamento em Lançamentos; os totais serão corrigidos pelo vínculo. Não invente uma contraparte.</p>
      <div className="grid grid-2">{[['opening_balance', 'Saldo de abertura (R$)', 'number'], ['closing_balance', 'Saldo de fechamento (R$)', 'number'], ['period_start', 'Início do período', 'date'], ['period_end', 'Fim do período', 'date']].map(([key, label, type]) => <label key={key}>{label}<input required type={type} step={type === 'number' ? '0.01' : undefined} value={balance[key]} onChange={e => setBalance({ ...balance, [key]: e.target.value })} /></label>)}</div>
      <label><input type="checkbox" required checked={balance.source_confirmed} onChange={e => setBalance({ ...balance, source_confirmed: e.target.checked })} /> Conferi o período, os saldos e as linhas com o extrato original.</label>
      <button className="btn btn-primary" disabled={busy || loading || !total || !!error}>{busy ? 'Validando e aplicando…' : `Validar fechamento e aplicar ${total} linhas`}</button>
    </form>
  </BottomSheet>;
}

import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import DataError from '../../components/ui/DataError';
import ImportAuditModal from '../import/ImportAuditModal';
import { Link } from 'react-router-dom';

const LABELS = { queued: 'Na fila', processing: 'Extraindo', needs_review: 'Revisão necessária', completed: 'Aplicado', failed: 'Falhou', reversed: 'Revertido' };
export default function ReconciliationPage() {
  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setImports(await api.getImportHistory()); } catch (e) { setError(e); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const reverse = async (id) => {
    const reason = window.prompt('Descreva o motivo da reversão. As linhas da fonte serão preservadas.');
    if (!reason?.trim()) return;
    if (reason.trim().length < 5) { setError(new Error('Explique o motivo da reversão com pelo menos 5 caracteres.')); return; }
    if (!window.confirm('Reverter os lançamentos criados por este lote?')) return;
    try { await api.request(`/import/${id}/reverse`, { method: 'POST', body: { reason: reason.trim() } }); await load(); }
    catch (e) { setError(e); }
  };
  if (error) return <DataError error={error} onRetry={load} />;
  return <div><div className="page-header"><h1>Conferir extratos</h1><p>Concilie cada lote com os saldos da fonte antes de aplicá-lo às contas.</p></div>
    <Link className="btn btn-primary" to="/importar">Importar extrato</Link> <Link className="btn btn-secondary" to="/lancamentos?status=pending">Revisar lançamentos legados</Link> <button className="btn btn-secondary" onClick={load}>Atualizar</button>
    {loading ? <p role="status">Carregando histórico…</p> : !imports.length ? <div className="card"><h2>Nenhum extrato importado</h2><p>Não há evidência de conciliação até importar e conferir uma fonte.</p></div> : <div className="table-responsive"><table className="data-table"><thead><tr><th>Arquivo / conta</th><th>Linhas</th><th>Estado</th><th>Fechamento</th><th>Ações</th></tr></thead><tbody>{imports.map(item => <tr key={item.id}><td>{item.filename}<small style={{ display: 'block' }}>{item.accounts?.name}</small></td><td>{item.total_transactions ?? '—'}</td><td>{LABELS[item.status] || item.status}{item.error_message && <p role="alert">{item.error_message}</p>}</td><td>{item.balance_check ? 'Verificação de saldo registrada' : 'Não confirmado'}</td><td>{item.status === 'needs_review' && <button className="btn btn-primary" onClick={() => setSelected(item.id)}>Revisar lote completo</button>}{item.status === 'completed' && <button className="btn btn-secondary" onClick={() => reverse(item.id)}>Reverter lote</button>}</td></tr>)}</tbody></table></div>}
    {selected && <ImportAuditModal importId={selected} onClose={() => { setSelected(null); void load(); }} />}
  </div>;
}

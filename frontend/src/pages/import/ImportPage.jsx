import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import ImportAuditModal from './ImportAuditModal';
import DataError from '../../components/ui/DataError';
const LABELS = { queued: 'Na fila', processing: 'Extraindo linhas', needs_review: 'Revisão necessária', completed: 'Aplicado', failed: 'Falhou', cancelled: 'Cancelado', reversed: 'Revertido' };
export default function ImportPage() {
  const [accounts, setAccounts] = useState([]); const [history, setHistory] = useState([]); const [accountId, setAccountId] = useState(''); const [file, setFile] = useState(null); const [selected, setSelected] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(null);
  const [options, setOptions] = useState({ locale: 'pt-BR', delimiter: '', date: '', description: '', amount: '' });
  const load = useCallback(async () => { try { const [list, jobs] = await Promise.all([api.getAccounts(), api.getImportHistory()]); setAccounts(list); setHistory(jobs); setError(null); } catch (e) { setError(e); } }, []);
  useEffect(() => { void load(); }, [load]);
  const processing = history.some(job => ['queued', 'processing'].includes(job.status));
  useEffect(() => { if (!processing) return; const timer = setInterval(load, 4000); return () => clearInterval(timer); }, [processing, load]);
  const upload = async event => {
    event.preventDefault(); if (!file || !accountId) return; setBusy(true); setError(null);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('O limite por arquivo é 5 MB.');
      const parserOptions = { locale: options.locale, ...(options.delimiter ? { delimiter: options.delimiter } : {}), columns: Object.fromEntries(['date', 'description', 'amount'].filter(key => options[key]).map(key => [key, options[key]])) };
      await api.uploadFile(file, accountId, null, parserOptions); setFile(null); await load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const jobAction = async (id, action) => { setBusy(true); try { await api.request(`/import/${id}/${action}`, { method: 'POST', body: {} }); await load(); } catch (e) { setError(e); } finally { setBusy(false); } };
  const openSource = async id => { try { const result = await api.request(`/import/${id}/source`); const url = new URL(result.url); if (url.protocol !== 'https:') throw new Error('Endereço de arquivo inválido.'); window.open(url.toString(), '_blank', 'noopener,noreferrer'); } catch (e) { setError(e); } };
  return <div><div className="page-header"><h1>Importar e conferir extratos</h1><p>O upload prepara um lote. Seus saldos só mudam após conferir as linhas e aplicar o fechamento.</p></div>{error && <DataError error={error} onRetry={load} />}
    <form onSubmit={upload} className="card"><label>Conta de destino<select required value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">Selecione a conta e o titular</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name} · {account.type} · base {account.balance_date || 'não informada'}</option>)}</select></label><p><Link to="/configuracoes">Cadastre uma conta com saldo e data-base</Link> antes de importar. Não use uma conta corrente para a fatura de um cartão.</p>
      <label>Arquivo original (até 5 MB)<input type="file" required accept=".csv,.ofx,.pdf" onChange={e => setFile(e.target.files[0] || null)} /></label><p>CSV ou OFX são preferenciais. PDF precisa conter texto e linhas completas; páginas digitalizadas ou ambíguas podem ser recusadas. Exporte XLSX como CSV.</p>
      <details><summary>Formato e colunas do CSV</summary><label>Formato numérico<select value={options.locale} onChange={e => setOptions({ ...options, locale: e.target.value })}><option value="pt-BR">Brasileiro: 1.234,56</option><option value="en-US">Internacional: 1,234.56</option></select></label><label>Separador<select value={options.delimiter} onChange={e => setOptions({ ...options, delimiter: e.target.value })}><option value="">Detectar</option><option value=";">Ponto e vírgula</option><option value=",">Vírgula</option><option value={'\t'}>Tabulação</option></select></label>{[['date', 'Cabeçalho da data'], ['description', 'Cabeçalho da descrição'], ['amount', 'Cabeçalho do valor com sinal']].map(([key, label]) => <label key={key}>{label}<input value={options[key]} onChange={e => setOptions({ ...options, [key]: e.target.value })} placeholder="Deixe vazio para detectar" /></label>)}</details>
      <button className="btn btn-primary" disabled={busy || !file || !accountId}>{busy ? 'Enviando…' : 'Enviar para revisão'}</button>
    </form><div className="card"><h2>Integração bancária</h2><p>Conexão automática ainda em validação. Use extratos e conciliação por enquanto.</p></div>
    <h2>Lotes importados</h2><button onClick={load} className="btn btn-secondary">Atualizar histórico</button><div className="table-responsive"><table className="data-table"><thead><tr><th>Arquivo / conta</th><th>Estado</th><th>Linhas</th><th>Ações</th></tr></thead><tbody>{history.map(job => <tr key={job.id}><td>{job.filename}<small style={{ display: 'block' }}>{job.accounts?.name}</small></td><td>{LABELS[job.status] || job.status}{job.error_message && <p role="alert">{job.error_message}</p>}</td><td>{job.total_transactions ?? '—'}</td><td>{job.status === 'needs_review' && <button className="btn btn-primary" onClick={() => setSelected(job.id)}>Conferir lote</button>} <button className="btn btn-secondary" onClick={() => openSource(job.id)}>Arquivo original</button>{['failed', 'cancelled'].includes(job.status) && <button disabled={busy} onClick={() => jobAction(job.id, 'retry')}>Tentar novamente</button>}{['queued', 'needs_review'].includes(job.status) && <button disabled={busy} onClick={() => { if (confirm('Cancelar este lote sem aplicar ao saldo?')) jobAction(job.id, 'cancel'); }}>Cancelar lote</button>}</td></tr>)}</tbody></table></div>
    {selected && <ImportAuditModal importId={selected} onClose={() => { setSelected(null); void load(); }} />}
  </div>;
}

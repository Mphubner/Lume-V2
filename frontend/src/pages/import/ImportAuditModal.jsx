import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import BottomSheet from '../../components/ui/BottomSheet';
import DataError from '../../components/ui/DataError';
import { formatCurrency, formatDate } from '../../utils/format';

const PAGE_SIZE = 50;
const SOURCE_LABELS = { rule: 'Regra que você confirmou', history: 'Histórico confirmado deste espaço', merchant: 'Identificação do estabelecimento' };
const NATURE_LABELS = { transfer: 'Possível transferência', investment_principal: 'Possível aplicação ou resgate', refund: 'Possível estorno ou reembolso', loan_principal: 'Possível principal de empréstimo', owner_contribution: 'Possível aporte', unknown: 'Natureza a conferir' };
const MIN_SUGGESTION_CONFIDENCE = 0.85;

function categoryAvailableForRow(category, row) {
  return (row.workspace_id && category.workspace_id === row.workspace_id)
    || (category.is_system === true && category.user_id == null && category.workspace_id == null);
}

function categoryMatchesDirection(category, row) {
  const amount = Number(row.amount_cents ?? row.amount);
  const direction = amount < 0 ? 'expense' : amount > 0 ? 'income' : null;
  return category.type === 'both' || category.type === direction;
}

function applicableSuggestion(row, categoriesById) {
  const suggestion = row.category_suggestion;
  const category = categoriesById.get(suggestion?.category_id);
  return !row.category_id && category && categoryAvailableForRow(category, row) && categoryMatchesDirection(category, row)
    && Number.isFinite(suggestion.confidence) && suggestion.confidence >= MIN_SUGGESTION_CONFIDENCE;
}

function CategoryReview({ row, categories, categoriesById, draft, busy, suggestionsDisabled, onDraftChange, onSave, onApplySuggestion }) {
  const categoryId = draft?.categoryId ?? row.category_id ?? '';
  const allowsLearning = (row.economic_kind || 'standard') === 'standard' && !row.linked_transaction_id && !row.reversal_of && row.type !== 'transfer';
  const learnRule = allowsLearning && (draft?.learnRule ?? (row.learn_rule === true));
  const currentCategory = categoriesById.get(row.category_id);
  const availableCategories = categories.filter(category => categoryAvailableForRow(category, row) && categoryMatchesDirection(category, row));
  const currentIsIncompatible = currentCategory && (!categoryAvailableForRow(currentCategory, row) || !categoryMatchesDirection(currentCategory, row));
  const suggestion = row.category_suggestion;
  const suggestionCategory = categoriesById.get(suggestion?.category_id);
  const suggestedCategory = !row.category_id && suggestionCategory && categoryAvailableForRow(suggestionCategory, row) ? suggestionCategory : null;
  const canApplySuggestion = applicableSuggestion(row, categoriesById);
  const natureHint = !row.category_id && suggestion?.nature_hint;
  const hasChanges = categoryId !== (row.category_id || '') || learnRule !== (row.learn_rule === true);

  return <>
    {!row.category_id && <div style={{ marginBottom: '0.75rem' }}>
      {suggestedCategory ? <>
        <p><strong>Sugestão: {suggestedCategory.name}{suggestion.subcategory ? ` · ${suggestion.subcategory}` : ''}</strong></p>
        <small style={{ display: 'block' }}>{SOURCE_LABELS[suggestion.source] || 'Sugestão para conferência'} · {Number.isFinite(suggestion.confidence) ? `Confiança ${Math.round(suggestion.confidence * 100)}%` : 'Confiança não informada'}</small>
        <p>{suggestion.reason}</p>
        {canApplySuggestion ? <button type="button" className="btn btn-secondary btn-sm" disabled={busy || suggestionsDisabled} onClick={() => onApplySuggestion([row.id])}>Usar sugestão</button> : <p>Não há confiança suficiente ou a categoria não corresponde ao sinal. Escolha manualmente.</p>}
      </> : <p>Sem sugestão segura. {suggestion?.reason || 'Confira a origem e escolha uma categoria.'}</p>}
      {natureHint && <p><strong>{NATURE_LABELS[natureHint.economic_kind] || 'Natureza a conferir'}.</strong> {natureHint.reason} A natureza exige conferência; não será alterada pela sugestão de categoria.</p>}
    </div>}
    <label className="sr-only" htmlFor={`cat-${row.id}`}>Categoria de {row.description}</label>
    <select id={`cat-${row.id}`} disabled={busy} value={categoryId} onChange={event => onDraftChange(row, { categoryId: event.target.value, learnRule: event.target.value ? learnRule : false })}>
      <option value="">Sem categoria</option>
      {row.category_id && !currentCategory && <option value={row.category_id}>Categoria atual indisponível</option>}
      {currentIsIncompatible && <option value={currentCategory.id}>{currentCategory.name} (categoria atual)</option>}
      {availableCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
    </select>
    {row.category_id && row.subcategory && <small style={{ display: 'block' }}>Subcategoria atual: {row.subcategory}{categoryId !== row.category_id ? '. Será removida ao salvar a nova categoria.' : ''}</small>}
    {currentIsIncompatible && <small style={{ display: 'block' }}>A categoria atual foi preservada. Confira se ela corresponde ao sinal e ao espaço deste movimento.</small>}
    <label style={{ display: 'block', margin: '0.5rem 0' }}><input type="checkbox" aria-label={`Lembrar para próximos extratos de ${row.description}`} disabled={busy || !categoryId || !allowsLearning} checked={learnRule} onChange={event => onDraftChange(row, { categoryId, learnRule: allowsLearning && event.target.checked })} /> Lembrar para próximos extratos</label>
    {!allowsLearning && <small style={{ display: 'block' }}>Aprendizado só para receitas e despesas conferidas.</small>}
    {learnRule && <small style={{ display: 'block' }}>A escolha será lembrada depois que você aplicar o extrato.</small>}
    <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !hasChanges} onClick={() => onSave(row, { category_id: categoryId || null, learn_rule: learnRule, ...(categoryId !== (row.category_id || '') ? { subcategory: null } : {}) })}>Salvar categoria</button>
  </>;
}

export default function ImportAuditModal({ importId, onClose }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState({});
  const [error, setError] = useState(null);
  const [categoryNotice, setCategoryNotice] = useState('');
  const [categoryDrafts, setCategoryDrafts] = useState({});
  const [balance, setBalance] = useState({ opening_balance: '', closing_balance: '', period_start: '', period_end: '', source_confirmed: false });
  const categoriesById = useMemo(() => new Map(categories.map(category => [category.id, category])), [categories]);
  const suggestedRowIds = rows.filter(row => applicableSuggestion(row, categoriesById)).map(row => row.id);
  const hasCategoryDrafts = Object.keys(categoryDrafts).length > 0;
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [result, cats] = await Promise.all([api.getPendingReconciliation({ import_id: importId, limit: PAGE_SIZE, offset }), api.getCategories()]);
      setRows(result.transactions || []); setTotal(result.total); setCategories(cats);
    } catch (e) { setError(e); } finally { setLoading(false); }
  }, [importId, offset]);
  useEffect(() => { void load(); }, [load]);
  const updateRow = async (row, changes) => {
    setBusy(true); setCategoryNotice('');
    try { await api.request(`/import/rows/${row.id}`, { method: 'PATCH', body: changes }); await load(); return true; }
    catch (e) { setError(e); return false; } finally { setBusy(false); }
  };
  const changeCategoryDraft = (row, draft) => setCategoryDrafts(previous => {
    const next = { ...previous };
    if (draft.categoryId === (row.category_id || '') && draft.learnRule === (row.learn_rule === true)) delete next[row.id];
    else next[row.id] = draft;
    return next;
  });
  const saveCategory = async (row, changes) => {
    if (await updateRow(row, changes)) setCategoryDrafts(previous => { const next = { ...previous }; delete next[row.id]; return next; });
  };
  const applySuggestions = async (ids) => {
    if (!ids.length || hasCategoryDrafts) return;
    setBusy(true); setError(null); setCategoryNotice('');
    try {
      const result = await api.request(`/import/${importId}/categorize`, { method: 'POST', body: { ids } });
      await load();
      setCategoryNotice(`${result.categorized} ${result.categorized === 1 ? 'categoria preenchida' : 'categorias preenchidas'}. ${result.skipped} ${result.skipped === 1 ? 'linha preservada' : 'linhas preservadas'} ou sem sugestão segura. Os saldos não foram alterados.`);
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const approve = async (event) => {
    event.preventDefault();
    if (hasCategoryDrafts) { setError(new Error('Salve suas escolhas manuais de categoria antes de aplicar o extrato.')); return; }
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
      await api.reconcileAll({ import_id: importId, ids, balance_check: { ...balance } });
      onClose();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return <BottomSheet isOpen={!!importId} onClose={busy ? () => {} : onClose} title="Conferir e aplicar extrato" maxWidth={1100}>
    <p>As linhas abaixo estão em revisão e ainda não alteram os saldos. Valores e datas da fonte são preservados. Se estiverem errados, corrija a origem e importe novamente.</p>
    {error && <DataError error={error} onRetry={load} />}
    {categoryNotice && <p role="status">{categoryNotice}</p>}
    {loading ? <p role="status">Carregando linhas…</p> : <>
      <p role="status">Linhas {total ? offset + 1 : 0}–{Math.min(offset + PAGE_SIZE, total)} de {total}. A aplicação sempre abrange o lote completo.</p>
      <section className="card" style={{ marginBottom: '1rem' }} aria-label="Sugestões de categorias">
        <h3>Categorias para conferência</h3>
        <p>As sugestões usam regras confirmadas, histórico e identificação do estabelecimento. Movimentos entre pessoas e contas exigem conferência. Uma entrada Pix, sozinha, não comprova receita.</p>
        <p>{suggestedRowIds.length} {suggestedRowIds.length === 1 ? 'sugestão disponível' : 'sugestões disponíveis'} nesta página. Categorias já preenchidas são preservadas.</p>
        <p>Confira os motivos nas linhas abaixo antes de usar as sugestões. Isso só preenche categorias; o extrato e os saldos continuam aguardando sua aprovação.</p>
        {hasCategoryDrafts && <p>Salve suas escolhas manuais de categoria antes de usar sugestões ou aplicar o extrato.</p>}
        <button type="button" className="btn btn-secondary" disabled={busy || hasCategoryDrafts || !suggestedRowIds.length} onClick={() => applySuggestions(suggestedRowIds)}>Usar {suggestedRowIds.length} {suggestedRowIds.length === 1 ? 'sugestão' : 'sugestões'} desta página</button>
      </section>
      <div className="table-responsive"><table className="data-table"><thead><tr><th>Fonte e data</th><th>Interpretação</th><th>Valor</th><th>Categoria / natureza</th><th>Duplicidade</th></tr></thead><tbody>
        {rows.map(row => <tr key={row.id}>
          <td>{formatDate(row.date)}<details><summary>Ver linha original</summary><pre className="source-row">{typeof row.source === 'string' ? row.source : JSON.stringify(row.source || row.raw_data || {}, null, 2)}</pre></details></td>
          <td>{row.description}<small style={{ display: 'block' }}>{row.review_state || 'Pendente'}</small></td>
          <td>{formatCurrency(row.amount_cents != null ? row.amount_cents / 100 : row.amount)}</td>
          <td style={{ minWidth: 280, maxWidth: 380 }}><CategoryReview row={row} categories={categories} categoriesById={categoriesById} draft={categoryDrafts[row.id]} busy={busy} suggestionsDisabled={hasCategoryDrafts} onDraftChange={changeCategoryDraft} onSave={saveCategory} onApplySuggestion={applySuggestions} />
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
      <button className="btn btn-primary" disabled={busy || loading || hasCategoryDrafts || !total || !!error}>{busy ? 'Processando…' : `Validar fechamento e aplicar ${total} linhas`}</button>
    </form>
  </BottomSheet>;
}

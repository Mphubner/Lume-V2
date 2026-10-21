import { checked, fetchAll, HTTPError, assertUUID } from './access.js';
import { suggestTransactionCategory } from '../domain/categorization.js';

export const CATEGORY_SUGGESTION_THRESHOLD = 0.85;

/** Reads only the workspaces represented on this authorized page. No provider sees statement text. */
export async function withImportCategorySuggestions(db, rows, scope) {
  if (!rows.length) return [];
  const workspaceIds = [...new Set(rows.map(row => row.workspace_id))];
  if (workspaceIds.some(id => !scope.ids.includes(id))) throw new HTTPError(403, 'Linhas fora do contexto autorizado.');
  const [categories, rules, historyResult] = await Promise.all([
    fetchAll(() => db.from('categories').select('id,name,type,workspace_id,user_id,is_system,subcategories')
      .or(`and(is_system.eq.true,user_id.is.null,workspace_id.is.null),workspace_id.in.(${workspaceIds.join(',')})`).order('id')),
    fetchAll(() => db.from('ai_rules').select('id,workspace_id,keyword,category_id,subcategory,transaction_type,is_active')
      .in('workspace_id', workspaceIds).eq('is_active', true).order('id')),
    db.from('transactions').select('id,workspace_id,description,raw_description,amount,type,economic_kind,category_id,subcategory,ledger_status,is_reconciled,is_confirmed,legacy_needs_review,is_internal_transfer,linked_transaction_id,reversal_of,transfer_group_id,reviewed_by,reviewed_at')
      .in('workspace_id', workspaceIds).eq('ledger_status', 'posted').eq('is_reconciled', true)
      .eq('is_confirmed', true).eq('legacy_needs_review', false).eq('economic_kind', 'standard').eq('is_internal_transfer', false)
      .is('linked_transaction_id', null).is('reversal_of', null).is('transfer_group_id', null)
      .in('type', ['income', 'expense']).not('category_id', 'is', null)
      .not('reviewed_by', 'is', null).not('reviewed_at', 'is', null)
      .order('reviewed_at', { ascending: false }).order('id').limit(2000),
  ]);
  const history = checked(historyResult);
  return rows.map(row => ({ ...row, category_suggestion: suggestTransactionCategory({
    transaction: row, workspaceId: row.workspace_id, categories, rules, history,
  }) }));
}

/** Category choices are recalculated, then applied atomically with a missing-category guard in SQL. */
export async function applyImportCategorySuggestions(db, { actor, job, ids }) {
  if (job.status !== 'needs_review') throw new HTTPError(409, 'O lote precisa estar em revisão para sugerir categorias.');
  if (!Array.isArray(ids) || !ids.length || ids.length > 500 || new Set(ids).size !== ids.length) throw new HTTPError(400, 'Selecione entre 1 e 500 linhas distintas do lote.');
  ids.forEach(assertUUID);
  const rows = checked(await db.from('import_rows').select('*').eq('import_id', job.id).in('id', ids).order('id'));
  if (rows.length !== ids.length || rows.some(row => row.workspace_id !== job.workspace_id)) throw new HTTPError(403, 'Uma ou mais linhas não pertencem ao lote autorizado.');
  const proposed = await withImportCategorySuggestions(db, rows, { ids: [job.workspace_id] });
  const suggestions = proposed.filter(row => !row.category_id && (!row.economic_kind || row.economic_kind === 'standard')
    && !row.linked_transaction_id && !row.reversal_of && !row.transfer_group_id
    && row.category_suggestion.category_id && row.category_suggestion.confidence >= CATEGORY_SUGGESTION_THRESHOLD)
    .map(row => ({ id: row.id, category_id: row.category_suggestion.category_id, subcategory: row.category_suggestion.subcategory }));
  if (!suggestions.length) return { categorized: 0, skipped: ids.length, review_required: true };
  const result = checked(await db.rpc('apply_import_category_suggestions', { p_actor: actor, p_import: job.id, p_suggestions: suggestions }));
  return { ...result, skipped: Number(result.skipped || 0) + ids.length - suggestions.length, review_required: true };
}

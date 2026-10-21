import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { generateBudget } from '../services/aiService.js';
import { getFinancialSnapshot, getFinancialContext, publicContext } from '../services/financialFacts.js';
import { resolveScope, scopeQuery, requireRecordAccess, assertCategoryAccess, fetchAll, handleError } from '../services/access.js';
import { nonnegativeMoney, scopedBody } from '../domain/schemas.js';
import { addDays, dateOnly } from '../domain/financial.js';
import { today } from '../domain/money.js';
import { mutate } from '../services/mutations.js';
import { enrichFinancialRows } from '../services/relations.js';

const router = Router();
router.use(authMiddleware);
const monthSchema = z.object({ month: z.coerce.number().int().min(1).max(12), year: z.coerce.number().int().min(1900).max(2200) });
const budgetSchema = monthSchema.extend({ category_id: z.string().uuid(), planned_amount: nonnegativeMoney }).strict();
function periodFor(query) {
  return monthSchema.parse({ month: query.month ?? Number(today().slice(5, 7)), year: query.year ?? Number(today().slice(0, 4)) });
}
router.get('/', async (req, res) => {
  try {
    const period = periodFor(req.query);
    const scope = await resolveScope(supabase, req.user.id, req.query.workspace);
    const rawRows = await fetchAll(() => scopeQuery(supabase.from('budgets').select('*'), scope)
      .eq('month', period.month).eq('year', period.year).order('id'));
    const rows = await enrichFinancialRows(supabase, rawRows, scope);
    const targetStart = period.year + '-' + String(period.month).padStart(2, '0') + '-01';
    const snapshot = targetStart <= today() ? await getFinancialSnapshot(supabase, req.user.id, period, { scope }) : null;
    res.json(rows.map(row => ({ ...row,
      spent_amount: snapshot && !row.relation_needs_review ? snapshot.byWorkspaceCategory.find(category => category.workspace_id === row.workspace_id && category.category_id === row.category_id)?.total ?? 0 : null,
      coverage: snapshot?.coverage ?? null, basis: snapshot ? 'posted_reconciled' : 'future_period' })));
  } catch (error) { handleError(res, error); }
});
router.post('/generate', async (req, res) => {
  try {
    const { workspace, fields } = scopedBody(req.body);
    const target = periodFor(fields);
    const targetStart = target.year + '-' + String(target.month).padStart(2, '0') + '-01';
    const cursor = new Date(targetStart + 'T12:00:00Z');
    cursor.setUTCMonth(cursor.getUTCMonth() - 3);
    const context = await getFinancialContext(supabase, req.user.id, { workspace: workspace ?? req.query.workspace,
      start_date: dateOnly(cursor), end_date: addDays(targetStart, -1) });
    res.json({ ...publicContext(context), ...await generateBudget(context), target });
  } catch (error) { handleError(res, error); }
});
router.post('/', async (req, res) => {
  try {
    const { workspace, fields } = scopedBody(req.body);
    const scope = await resolveScope(supabase, req.user.id, workspace ?? req.query.workspace, 'write');
    const payload = budgetSchema.parse(fields);
    await assertCategoryAccess(supabase, payload.category_id, req.user.id, scope.id);
    res.status(201).json(await mutate(supabase, req.user.id, 'budgets', 'insert', scope.id, payload));
  } catch (error) { handleError(res, error); }
});
router.delete('/:id', async (req, res) => {
  try {
    const row = await requireRecordAccess(supabase, 'budgets', req.params.id, req.user.id, 'write');
    await mutate(supabase, req.user.id, 'budgets', 'delete', row.workspace_id, {}, row.id);
    res.json({ success: true });
  } catch (error) { handleError(res, error); }
});
export default router;

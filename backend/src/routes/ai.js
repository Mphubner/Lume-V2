import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { generateInsights, chatWithAssistant } from '../services/aiService.js';
import { getFinancialContext, publicContext } from '../services/financialFacts.js';
import { resolveScope, scopeQuery, requireRecordAccess, assertCategoryAccess, fetchAll, handleError, HTTPError } from '../services/access.js';
import { ruleSchema, scopedBody } from '../domain/schemas.js';
import { mutate } from '../services/mutations.js';
import { enrichFinancialRows } from '../services/relations.js';

const router = Router();
router.use(authMiddleware);
// No user-only cache: each answer is rebuilt from the requested scope/period/version.
router.post('/insights', async (req, res) => {
  try {
    const { workspace, fields } = scopedBody(req.body);
    const context = await getFinancialContext(supabase, req.user.id, { ...fields, ...req.query, workspace: workspace ?? req.query.workspace });
    const result = await generateInsights(context);
    res.json({ ...publicContext(context), ...result, cached: false });
  } catch (error) { handleError(res, error); }
});
router.post('/chat', async (req, res) => {
  try {
    const { workspace, fields } = scopedBody(req.body);
    const message = z.string().trim().min(1).max(2000).parse(fields.message);
    const context = await getFinancialContext(supabase, req.user.id, { ...fields, ...req.query, workspace: workspace ?? req.query.workspace });
    res.json({ ...publicContext(context), ...await chatWithAssistant(message, context), cached: false });
  } catch (error) { handleError(res, error); }
});
router.get('/rules', async (req, res) => {
  try {
    const scope = await resolveScope(supabase, req.user.id, req.query.workspace);
    const rows = await fetchAll(() => scopeQuery(supabase.from('ai_rules').select('*'), scope).order('id'));
    const rules = await enrichFinancialRows(supabase, rows, scope);
    res.json({ rules, stats: { activeRules: rules.filter(rule => rule.is_active).length,
      totalApplications: rules.reduce((sum, rule) => sum + Number(rule.usage_count ?? 0), 0), totalRules: rules.length } });
  } catch (error) { handleError(res, error); }
});
router.put('/rules/:id', async (req, res) => {
  try {
    const row = await requireRecordAccess(supabase, 'ai_rules', req.params.id, req.user.id, 'write');
    const { workspace, fields } = scopedBody(req.body);
    if (workspace) {
      const scope = await resolveScope(supabase, req.user.id, workspace, 'write');
      if (scope.id !== row.workspace_id) throw new HTTPError(403, 'Não é permitido mover a regra para outro espaço.');
    }
    const updates = ruleSchema.partial().parse(fields);
    if (!Object.keys(updates).length) throw new HTTPError(400, 'Nenhuma alteração informada.');
    if (updates.category_id !== undefined) await assertCategoryAccess(supabase, updates.category_id, req.user.id, row.workspace_id);
    res.json(await mutate(supabase, req.user.id, 'ai_rules', 'update', row.workspace_id, updates, row.id));
  } catch (error) { handleError(res, error); }
});
router.delete('/rules/:id', async (req, res) => {
  try {
    const row = await requireRecordAccess(supabase, 'ai_rules', req.params.id, req.user.id, 'write');
    await mutate(supabase, req.user.id, 'ai_rules', 'delete', row.workspace_id, {}, row.id);
    res.json({ success: true });
  } catch (error) { handleError(res, error); }
});
export default router;

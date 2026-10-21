import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { generateInsights, chatWithAssistant, getAIReadiness } from '../services/aiService.js';
import { generateFinancialPlan } from '../services/plannerService.js';
import { plannerScenarioSchema } from '../domain/planner.js';
import { getFinancialContext, publicContext } from '../services/financialFacts.js';
import { resolveScope, scopeQuery, requireRecordAccess, assertCategoryAccess, fetchAll, handleError, HTTPError } from '../services/access.js';
import { ruleSchema, scopedBody } from '../domain/schemas.js';
import { mutate } from '../services/mutations.js';
import { enrichFinancialRows } from '../services/relations.js';

const planRequestSchema = z.object({
  scenario: plannerScenarioSchema.optional(), baseFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  period: z.enum(['month', '3months', '6months', '12months', 'year']).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(), year: z.coerce.number().int().min(1900).max(2200).optional(),
  start_date: z.string().optional(), end_date: z.string().optional(),
}).strict();
export function createAIRouter(db = supabase, authenticate = authMiddleware, aiOptions = {}) {
const router = Router();
router.use(authenticate);
router.get('/status', (_req, res) => res.json(getAIReadiness(aiOptions.env)));
router.post('/plan', async (req, res) => {
  try {
    const { workspace: bodyWorkspace, fields } = scopedBody(req.body);
    if (bodyWorkspace && req.query.workspace && bodyWorkspace !== req.query.workspace) throw new HTTPError(400, 'Espaços conflitantes.');
    const { scenario, baseFingerprint, ...period } = planRequestSchema.parse(fields);
    const workspace = bodyWorkspace ?? req.query.workspace;
    // A plan distributes one workspace's hypothetical surplus, never a mixed pool.
    const scope = await resolveScope(db, req.user.id, workspace);
    if (!scope.id || scope.ids.length !== 1) throw new HTTPError(400, 'Selecione um espaço específico para calcular o plano.');
    const context = await getFinancialContext(db, req.user.id, { ...period, workspace }, { scope });
    if (baseFingerprint && baseFingerprint !== context.fingerprint) throw new HTTPError(409, 'Os dados mudaram desde o último plano. Recarregue a base e revise o cenário.');
    res.json({ ...publicContext(context), ...await generateFinancialPlan(context, scenario, aiOptions), cached: false });
  } catch (error) { handleError(res, error); }
});
// No user-only cache: each answer is rebuilt from the requested scope/period/version.
router.post('/insights', async (req, res) => {
  try {
    const { workspace, fields } = scopedBody(req.body);
    const context = await getFinancialContext(db, req.user.id, { ...fields, ...req.query, workspace: workspace ?? req.query.workspace });
    const result = await generateInsights(context);
    res.json({ ...publicContext(context), ...result, cached: false });
  } catch (error) { handleError(res, error); }
});
router.post('/chat', async (req, res) => {
  try {
    const { workspace, fields } = scopedBody(req.body);
    const message = z.string().trim().min(1).max(2000).parse(fields.message);
    const context = await getFinancialContext(db, req.user.id, { ...fields, ...req.query, workspace: workspace ?? req.query.workspace });
    res.json({ ...publicContext(context), ...await chatWithAssistant(message, context), cached: false });
  } catch (error) { handleError(res, error); }
});
router.get('/rules', async (req, res) => {
  try {
    const scope = await resolveScope(db, req.user.id, req.query.workspace);
    const rows = await fetchAll(() => scopeQuery(db.from('ai_rules').select('*'), scope).order('id'));
    const rules = await enrichFinancialRows(db, rows, scope);
    res.json({ rules, stats: { activeRules: rules.filter(rule => rule.is_active).length,
      totalApplications: rules.reduce((sum, rule) => sum + Number(rule.usage_count ?? 0), 0), totalRules: rules.length } });
  } catch (error) { handleError(res, error); }
});
router.put('/rules/:id', async (req, res) => {
  try {
    const row = await requireRecordAccess(db, 'ai_rules', req.params.id, req.user.id, 'write');
    const { workspace, fields } = scopedBody(req.body);
    if (workspace) {
      const scope = await resolveScope(db, req.user.id, workspace, 'write');
      if (scope.id !== row.workspace_id) throw new HTTPError(403, 'Não é permitido mover a regra para outro espaço.');
    }
    const updates = ruleSchema.partial().parse(fields);
    if (!Object.keys(updates).length) throw new HTTPError(400, 'Nenhuma alteração informada.');
    if (updates.category_id !== undefined) await assertCategoryAccess(db, updates.category_id, req.user.id, row.workspace_id);
    res.json(await mutate(db, req.user.id, 'ai_rules', 'update', row.workspace_id, updates, row.id));
  } catch (error) { handleError(res, error); }
});
router.delete('/rules/:id', async (req, res) => {
  try {
    const row = await requireRecordAccess(db, 'ai_rules', req.params.id, req.user.id, 'write');
    await mutate(db, req.user.id, 'ai_rules', 'delete', row.workspace_id, {}, row.id);
    res.json({ success: true });
  } catch (error) { handleError(res, error); }
});
return router;
}
export default createAIRouter();

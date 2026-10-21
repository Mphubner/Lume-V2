import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { getFinancialContext, publicContext } from '../services/financialFacts.js';
import { calculateDeterministicHealth, completedPeriod } from '../domain/financial.js';
import { today } from '../domain/money.js';
import { resolveScope, scopeQuery, checked, handleError } from '../services/access.js';
import { scopedBody } from '../domain/schemas.js';

const router = Router();
router.use(authMiddleware);
const scoreColumns = { taxa_poupanca: 'savings_rate_score', gestao_dividas: 'debt_management_score', reserva_emergencia: 'emergency_reserve_score',
  diversificacao: 'diversification_score', pagamento_contas: 'bill_payment_score', controle_gastos: 'spending_control_score' };
export function healthRecord(result) {
  return { total_score: result.total_score, grade: result.grade, coverage: result.coverage,
    formula_version: result.formulaVersion, facts_fingerprint: result.fingerprint,
    period_start: result.period.startDate, period_end: result.period.endDate, result,
    ...Object.fromEntries(Object.entries(scoreColumns).map(([key, column]) => [column, result.categories[key]?.score ?? null])) };
}
function healthQuery(query = {}) {
  return query.period || query.month || query.year || query.start_date || query.startDate || query.end_date || query.endDate
    ? query : { ...query, ...completedPeriod(today(), 3) };
}
router.get('/', async (req, res) => {
  try {
    const context = await getFinancialContext(supabase, req.user.id, healthQuery(req.query));
    const result = calculateDeterministicHealth(context);
    const history = context.snapshot.scope.id ? checked(await scopeQuery(supabase.from('health_scores').select('*'), context.snapshot.scope)
      .order('calculated_at', { ascending: false }).limit(12)) : [];
    res.json({ ...publicContext(context), latest: { ...healthRecord(result), ...result },
      history: history.filter(row => row.formula_version === result.formulaVersion).map(row => ({ ...row, current: row.facts_fingerprint === context.fingerprint })) });
  } catch (error) { handleError(res, error); }
});
router.post('/calculate', async (req, res) => {
  try {
    const { workspace, fields } = scopedBody(req.body);
    const query = healthQuery({ ...fields, ...req.query, workspace: workspace ?? req.query.workspace });
    const scope = await resolveScope(supabase, req.user.id, query.workspace);
    const context = await getFinancialContext(supabase, req.user.id, query, { scope });
    const result = calculateDeterministicHealth(context);
    // A derived diagnosis is computed fresh; it does not create another copy of
    // financial facts or require a write after the workspace access check.
    res.json({ ...publicContext(context), ...result, persisted: false });
  } catch (error) { handleError(res, error); }
});
export default router;

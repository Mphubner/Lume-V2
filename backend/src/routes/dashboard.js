import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { getFinancialContext, publicContext } from '../services/financialFacts.js';
import { calculateDeterministicHealth } from '../domain/financial.js';
import { handleError } from '../services/access.js';

const router = Router();
router.use(authMiddleware);
router.get('/', async (req, res) => {
  try {
    const context = await getFinancialContext(supabase, req.user.id, req.query);
    const { snapshot } = context;
    res.json({ ...publicContext(context), stats: snapshot.stats, accounts: snapshot.accounts,
      byCategory: snapshot.byCategory, monthlyEvolution: snapshot.monthlyEvolution,
      upcomingBills: context.upcomingBills, overdueBills: context.overdueBills,
      cashFlowProjection: context.cashFlowProjection, projectionAssumptions: context.projectionAssumptions,
      incompleteSchedules: context.incompleteSchedules, totalDebt: context.totalDebt,
      goalsProgress: context.goalsProgress, emergencyReserve: context.emergencyReserve,
      healthScore: calculateDeterministicHealth(context) });
  } catch (error) { handleError(res, error); }
});
export default router;

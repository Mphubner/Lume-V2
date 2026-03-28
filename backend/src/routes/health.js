import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { calculateHealthScore } from '../services/aiService.js';

const router = Router();
router.use(authMiddleware);

// GET /api/health — Get latest health score + history
router.get('/', async (req, res) => {
  try {
    const { data: scores, error } = await supabase.from('health_scores').select('*').eq('user_id', req.user.id).order('calculated_at', { ascending: false }).limit(12);
    if (error) throw error;
    res.json({ latest: scores[0] || null, history: scores });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar saúde financeira' });
  }
});

// POST /api/health/calculate — Recalculate health score
router.post('/calculate', async (req, res) => {
  try {
    // Gather user data
    const now = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const [transactions, debts, reserve, goals, recurring] = await Promise.all([
      supabase.from('transactions').select('amount, type, date').eq('user_id', req.user.id).gte('date', sixMonthsAgo.toISOString().split('T')[0]),
      supabase.from('debts').select('*').eq('user_id', req.user.id),
      supabase.from('emergency_reserve').select('*').eq('user_id', req.user.id).single(),
      supabase.from('goals').select('*').eq('user_id', req.user.id),
      supabase.from('recurring_bills').select('*').eq('user_id', req.user.id).eq('status', 'active'),
    ]);

    const txData = transactions.data || [];
    const monthlyIncome = txData.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount), 0) / 6;
    const monthlyExpenses = txData.filter(t => t.type === 'expense').reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0) / 6;

    const userData = {
      monthlyIncome,
      monthlyExpenses,
      savingsRate: monthlyIncome > 0 ? ((monthlyIncome - monthlyExpenses) / monthlyIncome * 100) : 0,
      totalDebt: (debts.data || []).filter(d => d.status === 'active').reduce((s, d) => s + parseFloat(d.current_balance || d.original_amount), 0),
      emergencyReserve: reserve.data?.current_amount || 0,
      monthsOfReserve: monthlyExpenses > 0 ? (reserve.data?.current_amount || 0) / monthlyExpenses : 0,
      activeGoals: (goals.data || []).filter(g => g.status === 'active').length,
      recurringBills: (recurring.data || []).length,
    };

    const result = await calculateHealthScore(userData);

    // Save to history
    const { data: saved, error } = await supabase.from('health_scores').insert({
      user_id: req.user.id,
      total_score: result.total_score,
      grade: result.grade,
      savings_rate_score: result.categories?.taxa_poupanca?.score || 0,
      debt_management_score: result.categories?.gestao_dividas?.score || 0,
      emergency_reserve_score: result.categories?.reserva_emergencia?.score || 0,
      diversification_score: result.categories?.diversificacao?.score || 0,
      bill_payment_score: result.categories?.pagamento_contas?.score || 0,
      spending_control_score: result.categories?.controle_gastos?.score || 0,
    }).select().single();

    res.json({ ...result, saved });
  } catch (err) {
    console.error('Health score error:', err);
    res.status(500).json({ error: 'Erro ao calcular saúde financeira' });
  }
});

export default router;

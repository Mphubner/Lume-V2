import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { generateInsights, chatWithAssistant } from '../services/aiService.js';

const router = Router();
router.use(authMiddleware);

// ─── Helper: build full financial context for RAG ───────────────────────────
async function buildFinancialContext(userId) {
  const now = new Date();
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const [txResult, debtsResult, goalsResult, reserveResult, recurringResult, healthResult] = await Promise.all([
    supabase.from('transactions').select('amount, type, date, description, categories(name, group_name, nature)').eq('user_id', userId).gte('date', threeMonthsAgo.toISOString().split('T')[0]).eq('is_reconciled', true),
    supabase.from('debts').select('name, original_amount, current_balance, interest_rate, due_date, status').eq('user_id', userId).eq('status', 'active'),
    supabase.from('goals').select('name, target_amount, current_amount, target_date, status').eq('user_id', userId).eq('status', 'active'),
    supabase.from('emergency_reserve').select('target_amount, current_amount').eq('user_id', userId).single(),
    supabase.from('recurring_bills').select('name, amount, due_day, recurrence, category_id, categories(name)').eq('user_id', userId).eq('status', 'active'),
    supabase.from('health_scores').select('total_score, grade, calculated_at').eq('user_id', userId).order('calculated_at', { ascending: false }).limit(2),
  ]);

  const txData = txResult.data || [];
  const currentMonthTx = txData.filter(t => t.date >= monthStart);
  const income = currentMonthTx.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount), 0);
  const expenses = currentMonthTx.filter(t => t.type === 'expense').reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);

  // Spending by nature (Fixo/Variável/Futuro)
  const byNature = {};
  txData.filter(t => t.type === 'expense').forEach(t => {
    const nature = t.categories?.nature || 'variavel';
    byNature[nature] = (byNature[nature] || 0) + Math.abs(parseFloat(t.amount));
  });

  // Category breakdown for last 3 months
  const byCategory = {};
  txData.filter(t => t.type === 'expense').forEach(t => {
    const cat = t.categories?.name || 'Outros';
    byCategory[cat] = (byCategory[cat] || 0) + Math.abs(parseFloat(t.amount));
  });

  const healthScores = healthResult.data || [];

  return {
    currentMonth: now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    currentMonthIncome: income,
    currentMonthExpenses: expenses,
    currentMonthBalance: income - expenses,
    last3MonthsExpensesByCategory: byCategory,
    expensesByNature: byNature,
    activeDebts: (debtsResult.data || []).map(d => ({
      name: d.name,
      balance: d.current_balance,
      rate: d.interest_rate,
      dueDate: d.due_date,
    })),
    activeGoals: (goalsResult.data || []).map(g => ({
      name: g.name,
      target: g.target_amount,
      current: g.current_amount,
      progress: g.target_amount > 0 ? ((g.current_amount / g.target_amount) * 100).toFixed(1) + '%' : '0%',
      dueDate: g.target_date,
    })),
    emergencyReserve: {
      current: reserveResult.data?.current_amount || 0,
      target: reserveResult.data?.target_amount || 0,
    },
    recurringBills: (recurringResult.data || []).map(r => ({
      name: r.name,
      amount: r.amount,
      dueDay: r.due_day,
      category: r.categories?.name,
    })),
    healthScore: healthScores[0] ? {
      current: healthScores[0].total_score,
      grade: healthScores[0].grade,
      previous: healthScores[1]?.total_score ?? null,
    } : null,
  };
}

// ─── POST /api/ai/insights (with cache) ─────────────────────────────────────
router.post('/insights', async (req, res) => {
  try {
    const userId = req.user.id;
    const forceRefresh = req.query.force === 'true';

    // 1. Check if cached insights are still fresh (no financial changes since last generation)
    const { data: profile } = await supabase.from('profiles').select('needs_insight_recalc, last_insight_at').eq('id', userId).single();

    if (!forceRefresh && profile && !profile.needs_insight_recalc && profile.last_insight_at) {
      // Return the last cached insights
      const { data: cached } = await supabase.from('ai_insights_cache').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).single();
      if (cached) {
        return res.json({ ...JSON.parse(cached.payload), cached: true, generatedAt: cached.created_at });
      }
    }

    // 2. Build full context and generate fresh insights
    const context = await buildFinancialContext(userId);
    
    // Add previous health score for evolutionary tips
    const now = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const txResult = await supabase.from('transactions').select('amount, type, date, categories(name)').eq('user_id', userId).gte('date', threeMonthsAgo.toISOString().split('T')[0]).eq('is_reconciled', true);
    const txData = txResult.data || [];

    const financialData = {
      ...context,
      period: '3 meses',
      totalIncome: txData.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount), 0),
      totalExpenses: txData.filter(t => t.type === 'expense').reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0),
    };

    const result = await generateInsights(financialData);

    // 3. Cache the result and reset the dirty flag
    await Promise.all([
      supabase.from('ai_insights_cache').insert({ user_id: userId, payload: JSON.stringify(result) }),
      supabase.from('profiles').update({ needs_insight_recalc: false, last_insight_at: new Date().toISOString() }).eq('id', userId),
    ]);

    res.json({ ...result, cached: false, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('Insights error:', err);
    res.status(500).json({ error: 'Erro ao gerar insights' });
  }
});

// ─── POST /api/ai/chat (with full RAG context) ───────────────────────────────
router.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Mensagem é obrigatória' });

    // Build full context (RAG) instead of just income/expenses
    const context = await buildFinancialContext(req.user.id);

    const response = await chatWithAssistant(message, context);
    res.json({ message: response });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Erro no chat' });
  }
});

// ─── GET /api/ai/rules ────────────────────────────────────────────────────────
router.get('/rules', async (req, res) => {
  try {
    const { data, error } = await supabase.from('ai_rules').select('*, categories(name, icon)').eq('user_id', req.user.id).order('usage_count', { ascending: false });
    if (error) throw error;

    const stats = {
      activeRules: data.filter(r => r.is_active).length,
      totalApplications: data.reduce((s, r) => s + r.usage_count, 0),
      totalRules: data.length,
    };

    res.json({ rules: data, stats });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar regras da IA' });
  }
});

// ─── PUT /api/ai/rules/:id ───────────────────────────────────────────────────
router.put('/rules/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('ai_rules').update(req.body).eq('id', req.params.id).eq('user_id', req.user.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar regra' });
  }
});

// ─── DELETE /api/ai/rules/:id ────────────────────────────────────────────────
router.delete('/rules/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('ai_rules').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir regra' });
  }
});

export default router;

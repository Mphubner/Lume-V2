import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { generateInsights, chatWithAssistant } from '../services/aiService.js';

const router = Router();
router.use(authMiddleware);

// POST /api/ai/insights
router.post('/insights', async (req, res) => {
  try {
    // Gather financial data
    const now = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const [txResult, debtsResult, goalsResult, reserveResult] = await Promise.all([
      supabase.from('transactions').select('amount, type, date, categories(name)').eq('user_id', req.user.id).gte('date', threeMonthsAgo.toISOString().split('T')[0]),
      supabase.from('debts').select('*').eq('user_id', req.user.id).eq('status', 'active'),
      supabase.from('goals').select('*').eq('user_id', req.user.id).eq('status', 'active'),
      supabase.from('emergency_reserve').select('*').eq('user_id', req.user.id).single(),
    ]);

    const txData = txResult.data || [];
    const income = txData.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount), 0);
    const expenses = txData.filter(t => t.type === 'expense').reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);

    const byCategory = {};
    txData.filter(t => t.type === 'expense').forEach(t => {
      const cat = t.categories?.name || 'Outros';
      byCategory[cat] = (byCategory[cat] || 0) + Math.abs(parseFloat(t.amount));
    });

    const financialData = {
      period: '3 meses',
      totalIncome: income,
      totalExpenses: expenses,
      balance: income - expenses,
      savingsRate: income > 0 ? ((income - expenses) / income * 100).toFixed(1) + '%' : '0%',
      expensesByCategory: byCategory,
      activeDebts: (debtsResult.data || []).length,
      totalDebt: (debtsResult.data || []).reduce((s, d) => s + parseFloat(d.current_balance || 0), 0),
      activeGoals: (goalsResult.data || []).length,
      emergencyReserve: reserveResult.data?.current_amount || 0,
      uncategorizedAmount: byCategory['Outros'] || 0,
    };

    const result = await generateInsights(financialData);
    res.json(result);
  } catch (err) {
    console.error('Insights error:', err);
    res.status(500).json({ error: 'Erro ao gerar insights' });
  }
});

// POST /api/ai/chat
router.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Mensagem é obrigatória' });

    // Build context
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const { data: txData } = await supabase.from('transactions').select('amount, type, categories(name)').eq('user_id', req.user.id).gte('date', monthStart);

    const income = (txData || []).filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount), 0);
    const expenses = (txData || []).filter(t => t.type === 'expense').reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);

    const context = {
      currentMonth: now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
      income,
      expenses,
      balance: income - expenses,
    };

    const response = await chatWithAssistant(message, context);
    res.json({ message: response });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Erro no chat' });
  }
});

// GET /api/ai/rules
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

// PUT /api/ai/rules/:id
router.put('/rules/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('ai_rules').update(req.body).eq('id', req.params.id).eq('user_id', req.user.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar regra' });
  }
});

// DELETE /api/ai/rules/:id
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

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { generateBudget } from '../services/aiService.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { month, year } = req.query;
    const m = month || new Date().getMonth() + 1;
    const y = year || new Date().getFullYear();

    const { data, error } = await supabase.from('budgets').select('*, categories(name, icon, color)').eq('user_id', req.user.id).eq('month', m).eq('year', y);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar orçamentos' });
  }
});

// POST /api/budgets/generate — AI budget generation
router.post('/generate', async (req, res) => {
  try {
    const { month, year } = req.body;
    // Get last 3 months of transactions
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const { data: transactions } = await supabase.from('transactions').select('amount, type, category_id, categories(name)').eq('user_id', req.user.id).gte('date', threeMonthsAgo.toISOString().split('T')[0]);
    const { data: goals } = await supabase.from('goals').select('*').eq('user_id', req.user.id).eq('status', 'active');

    const historicalData = {};
    transactions?.filter(t => t.type === 'expense').forEach(t => {
      const cat = t.categories?.name || 'Outros';
      if (!historicalData[cat]) historicalData[cat] = [];
      historicalData[cat].push(Math.abs(parseFloat(t.amount)));
    });

    const budget = await generateBudget(historicalData, goals);
    res.json(budget);
  } catch (err) {
    console.error('Budget generation error:', err);
    res.status(500).json({ error: 'Erro ao gerar orçamento' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from('budgets').insert({ ...req.body, user_id: req.user.id }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar orçamento' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('budgets').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir orçamento' });
  }
});

export default router;

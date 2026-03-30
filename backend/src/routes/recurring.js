import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { workspace } = req.query;
    let query = supabase.from('recurring_bills').select('*, categories(name, icon, color)').eq('user_id', req.user.id).order('due_day');

    if (workspace === 'personal') {
      // NOTE: recurring bills don't natively have account_type, but let's assume personal is family_id = null
      query = query.is('family_id', null);
    } else if (workspace === 'business') {
      // Future-proofing if business recurring bills exist
      query = query.is('family_id', null); // Just a fallback, in standard scoping it's not well-represented for recurring without account_type
    } else if (workspace === 'family') {
      query = query.not('family_id', 'is', null);
    }

    const { data, error } = await query;
    if (error) throw error;

    const now = new Date();
    const currentDay = now.getDate();
    const stats = {
      totalMonthly: data.filter(b => b.status === 'active').reduce((s, b) => s + parseFloat(b.amount), 0),
      paidThisMonth: 0,
      pending: 0,
      overdue: data.filter(b => b.status === 'active' && b.due_day < currentDay).length,
    };

    res.json({ bills: data, stats });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar contas recorrentes' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from('recurring_bills').insert({ ...req.body, user_id: req.user.id }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar conta recorrente' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('recurring_bills').update(req.body).eq('id', req.params.id).eq('user_id', req.user.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar conta recorrente' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('recurring_bills').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir conta recorrente' });
  }
});

export default router;

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from('debts').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
    if (error) throw error;

    const active = data.filter(d => d.status === 'active');
    const paid = data.filter(d => d.status === 'paid');
    const stats = {
      totalOwed: active.reduce((s, d) => s + parseFloat(d.current_balance || d.original_amount), 0),
      totalPaid: paid.reduce((s, d) => s + parseFloat(d.original_amount), 0),
      monthlyPayment: active.reduce((s, d) => s + parseFloat(d.installment_amount || 0), 0),
      activeCount: active.length,
      paidCount: paid.length,
    };

    res.json({ debts: data, stats });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar dívidas' });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = { ...req.body, user_id: req.user.id };
    if (!body.current_balance) body.current_balance = body.original_amount;
    const { data, error } = await supabase.from('debts').insert(body).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar dívida' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('debts').update(req.body).eq('id', req.params.id).eq('user_id', req.user.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar dívida' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('debts').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir dívida' });
  }
});

export default router;

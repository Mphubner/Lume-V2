import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { data: accounts, error } = await supabase.from('accounts').select('*').eq('user_id', req.user.id).order('name');
    if (error) throw error;
    
    // dynamically sum transactions to compute the real current balance for each account
    const { data: txs } = await supabase.from('transactions').select('account_id, amount, type, is_internal_transfer').eq('user_id', req.user.id);
    
    const balances = {};
    if (txs) {
      txs.forEach(t => {
        if (!t.account_id || t.is_internal_transfer || t.type === 'transfer') return;
        if (!balances[t.account_id]) balances[t.account_id] = 0;
        if (t.type === 'income') balances[t.account_id] += parseFloat(t.amount || 0);
        else if (t.type === 'expense') balances[t.account_id] -= Math.abs(parseFloat(t.amount || 0));
      });
    }

    const enhancedAccounts = accounts.map(acc => ({
      ...acc,
      balance: parseFloat(acc.balance || 0) + (balances[acc.id] || 0)
    }));

    res.json(enhancedAccounts);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar contas' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from('accounts').insert({ ...req.body, user_id: req.user.id }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar conta' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('accounts').update(req.body).eq('id', req.params.id).eq('user_id', req.user.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar conta' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('accounts').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir conta' });
  }
});

export default router;

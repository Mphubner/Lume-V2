import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from('accounts').select('*').eq('user_id', req.user.id).order('name');
    if (error) throw error;
    res.json(data);
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

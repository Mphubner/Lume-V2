import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from('goals').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
    if (error) throw error;

    const active = data.filter(g => g.status === 'active');
    const stats = {
      activeCount: active.length,
      totalSaved: active.reduce((s, g) => s + parseFloat(g.current_amount), 0),
      totalTarget: active.reduce((s, g) => s + parseFloat(g.target_amount), 0),
      avgProgress: active.length > 0 ? active.reduce((s, g) => s + (parseFloat(g.current_amount) / parseFloat(g.target_amount) * 100), 0) / active.length : 0,
    };

    res.json({ goals: data, stats });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar metas' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from('goals').insert({ ...req.body, user_id: req.user.id }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar meta' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('goals').update(req.body).eq('id', req.params.id).eq('user_id', req.user.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar meta' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('goals').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir meta' });
  }
});

export default router;

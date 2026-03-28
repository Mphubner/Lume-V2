import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from('categories').select('*').or(`user_id.eq.${req.user.id},is_system.eq.true`).order('name');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar categorias' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from('categories').insert({ ...req.body, user_id: req.user.id }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar categoria' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('categories').update(req.body).eq('id', req.params.id).eq('user_id', req.user.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar categoria' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('categories').delete().eq('id', req.params.id).eq('user_id', req.user.id).eq('is_system', false);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir categoria' });
  }
});

export default router;

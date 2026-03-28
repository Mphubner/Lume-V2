import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', req.user.id).single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[ProfileRoute] Erro 500:', err);
    res.status(500).json({ error: 'Erro ao buscar perfil' });
  }
});

router.put('/', async (req, res) => {
  try {
    const allowedFields = ['full_name', 'phone', 'cpf', 'cep', 'street', 'street_number', 'complement', 'neighborhood', 'city', 'state', 'onboarding_completed'];
    const updates = {};
    allowedFields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    const { data, error } = await supabase.from('profiles').update(updates).eq('id', req.user.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

export default router;

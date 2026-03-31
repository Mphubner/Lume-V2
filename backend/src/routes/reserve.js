import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';

const router = Router();
router.use(authMiddleware);

// GET /api/reserve — Obter reserva do usuário
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('emergency_reserve')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "No rows found"

    res.json(data || { 
      target_amount: 0, 
      current_amount: 0, 
      monthly_income: 0, 
      months_target: 6 
    });
  } catch (err) {
    console.error('Reserve read error:', err.message);
    res.status(500).json({ error: 'Erro ao buscar reserva' });
  }
});

// POST /api/reserve/update — Atualizar dados de reserva
router.post('/update', async (req, res) => {
  try {
    const { current_amount, target_amount, monthly_income, months_target } = req.body;

    const { data: existing, error: findError } = await supabase
      .from('emergency_reserve')
      .select('id')
      .eq('user_id', req.user.id)
      .single();

    if (findError && findError.code !== 'PGRST116') throw findError;

    const payload = {
      user_id: req.user.id,
      current_amount: current_amount ?? 0,
      target_amount: target_amount ?? 0,
      monthly_income: monthly_income ?? 0,
      months_target: months_target ?? 6
    };

    if (existing) {
      const { data, error } = await supabase
        .from('emergency_reserve')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    } else {
      const { data, error } = await supabase
        .from('emergency_reserve')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      res.json(data);
    }
  } catch (err) {
    console.error('Reserve update error:', err.message);
    res.status(500).json({ error: 'Erro ao atualizar dados da reserva' });
  }
});

export default router;

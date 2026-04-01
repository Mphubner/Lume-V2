import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { logAudit } from './audit.js';

const router = Router();
router.use(authMiddleware);

// GET /api/reserve — Obter reserva do usuário
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('emergency_reserve')
      .select('*')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) throw error;

    res.json(data || {
      target_amount: 0,
      current_amount: 0,
      monthly_income: 0,
      months_target: 6
    });
  } catch (err) {
    console.error('Reserve read error:', err);
    res.status(500).json({ error: 'Erro ao buscar reserva: ' + err.message });
  }
});

// POST /api/reserve/update — Atualizar dados de reserva
router.post('/update', async (req, res) => {
  try {
    const { current_amount, target_amount, monthly_income, months_target } = req.body;

    // Only send known-safe columns
    const payload = {};
    if (current_amount !== undefined) payload.current_amount = parseFloat(current_amount) || 0;
    if (target_amount !== undefined) payload.target_amount = parseFloat(target_amount) || 0;
    if (monthly_income !== undefined) payload.monthly_income = parseFloat(monthly_income) || 0;
    if (months_target !== undefined) payload.months_target = parseInt(months_target) || 6;

    // Check if row already exists
    const { data: existing, error: findError } = await supabase
      .from('emergency_reserve')
      .select('id')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (findError) throw findError;

    let result;
    if (existing) {
      const { data, error } = await supabase
        .from('emergency_reserve')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      payload.user_id = req.user.id;
      const { data, error } = await supabase
        .from('emergency_reserve')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      result = data;
    }

    // Log this action for audit
    logAudit(req.user.id, 'reserve_update', `Reserva atualizada: meta R$ ${payload.target_amount || 0}, atual R$ ${payload.current_amount || 0}`, '🛡️');

    res.json(result);
  } catch (err) {
    console.error('Reserve update error:', err);
    res.status(500).json({ error: 'Erro ao atualizar dados da reserva: ' + err.message });
  }
});

export default router;

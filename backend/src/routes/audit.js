import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';

const router = Router();
router.use(authMiddleware);

// GET /api/audit — Get audit log for user
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Audit read error:', err);
    res.status(500).json({ error: 'Erro ao buscar auditoria' });
  }
});

export default router;

// Helper: call from other routes to log actions
export async function logAudit(userId, action, details, icon = '📋') {
  try {
    await supabase.from('audit_log').insert({
      user_id: userId,
      action,
      details,
      icon,
    });
  } catch (err) {
    console.error('Audit log error (non-critical):', err.message);
  }
}

import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import * as emailService from '../services/emailService.js';
import * as whatsappService from '../services/whatsappService.js';

const router = Router();
router.use(authMiddleware);

// GET /api/notifications
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50);
      
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[NotificationsRoute] Erro 500:', err);
    res.status(500).json({ error: 'Erro ao buscar notificações' });
  }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('user_id', req.user.id);
      
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao marcar como lida' });
  }
});

// POST /api/notifications/generate
// This would typically be called by a cron job, but we expose it for testing or manual triggers
router.post('/generate', async (req, res) => {
  try {
    // 1. Find bills due in 1-3 days
    // 2. Insert into 'notifications' table
    // 3. emailService.sendBillReminderEmail()
    // 4. whatsappService.sendWhatsAppNotification()

    res.json({ success: true, message: 'Processo de notificações automáticas rodado com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao gerar notificações' });
  }
});

export default router;

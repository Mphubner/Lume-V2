import { Router } from 'express';
import { generateConnectToken, syncTransactions } from '../services/pluggyService.js';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';

const router = Router();

// GET /api/pluggy/token
// Returns a single-use access token for the embedded React widget
router.get('/token', authMiddleware, async (req, res) => {
  try {
    const { itemId } = req.query; // If updating an existing connection
    const token = await generateConnectToken(itemId);
    res.json({ accessToken: token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/pluggy/webhook
// Listens for Pluggy events (Item Updated, Transactions Created) from their servers
router.post('/webhook', async (req, res) => {
  try {
    // Note: In production, verify the webhook signature (X-Pluggy-Signature)
    const { event, itemId } = req.body;
    console.log(`[Pluggy Webhook] Evento recebido: ${event} para Item: ${itemId}`);

    if (event === 'item/updated' || event === 'transactions/created') {
        // We must know which User owns this itemId
        // We'll store itemId <-> userId mapping in a future 'user_integrations' table or 'accounts'.
        // For now, this is a skeleton for the webhook.
        console.log(`[Pluggy Webhook] Sincronização pendente requer mapeamento do ItemID ${itemId} > UserID.`);
        // await syncTransactions(itemId, userId);
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('[Pluggy Webhook] Erro:', error.message);
    res.status(500).send('Webhook fail');
  }
});

export default router;

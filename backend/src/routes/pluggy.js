import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
const router=Router();
router.get('/capabilities',authMiddleware,(_req,res)=>res.json({enabled:false,reason:'Conexão bancária em validação. Use importação com revisão e conciliação.'}));
// No token may bind an arbitrary provider item to a different tenant. The incomplete
// integration stays unavailable until ownership, signature verification and ingest exist.
router.get('/token',authMiddleware,(_req,res)=>res.status(503).json({error:'Conexão bancária ainda indisponível. Importe seu extrato para revisão.'}));
router.post('/webhook',(_req,res)=>res.status(503).json({error:'Ingestão bancária não habilitada.'}));
export default router;

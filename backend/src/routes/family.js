import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
const router=Router();router.use(authMiddleware);
// Old credential-creation endpoints must not remain as alternate invitation paths.
router.use((req,res)=>res.status(410).json({error:'Use os espaços compartilhados e convites com aceite.',replacement:'/api/workspaces'}));
export default router;

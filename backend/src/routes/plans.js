import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { checked,handleError } from '../services/access.js';
const router=Router();
router.get('/',async(req,res)=>{try{
 if(!supabase)return res.status(503).json({error:'Catálogo indisponível.'});
 const rows=checked(await supabase.from('plans').select('id,name,price,interval,max_accounts,max_transactions,max_members,features,stripe_price_id').eq('is_active',true).order('price'));
 res.json({plans:rows.map(({stripe_price_id,...p})=>({...p,billing_cycle:p.interval,configured:Boolean(stripe_price_id)})),billing_enabled:process.env.BILLING_ENABLED==='true'&&Boolean(process.env.STRIPE_SECRET_KEY)});
}catch(e){handleError(res,e);}});
export default router;

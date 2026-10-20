import { createScopedCrud } from '../services/scopedCrud.js';
import { goalSchema } from '../domain/schemas.js';
import { sumMoney } from '../domain/money.js';
export default createScopedCrud({table:'goals',schema:goalSchema,present:goals=>{
 const active=goals.filter(g=>g.status==='active');
 return {goals,measurement:'manual',stats:{activeCount:active.length,totalSaved:sumMoney(active.map(g=>g.current_amount??0)),totalTarget:sumMoney(active.map(g=>g.target_amount)),avgProgress:active.length?active.reduce((s,g)=>s+(Number(g.current_amount)/Number(g.target_amount)*100),0)/active.length:0}};
}});

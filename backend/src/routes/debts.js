import { createScopedCrud } from '../services/scopedCrud.js';
import { debtSchema } from '../domain/schemas.js';
import { sumMoney } from '../domain/money.js';
export default createScopedCrud({table:'debts',schema:debtSchema,defaults:p=>({...p,current_balance:p.current_balance??p.original_amount}),present:debts=>{
 const active=debts.filter(d=>d.status==='active');const paid=debts.filter(d=>d.status==='paid');
 return {debts,measurement:'manual',stats:{totalOwed:sumMoney(active.map(d=>d.current_balance??d.original_amount)),totalPaid:sumMoney(paid.map(d=>d.original_amount)),monthlyPayment:sumMoney(active.map(d=>d.installment_amount??0)),activeCount:active.length,paidCount:paid.length}};
}});

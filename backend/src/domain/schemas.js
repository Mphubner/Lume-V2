import { z } from 'zod';
import { toCents, validDate } from './money.js';
export const money = z.union([z.number().finite(), z.string()]).refine(value => {
  try { toCents(value); return true; } catch { return false; }
}, 'Valor monetário inválido').transform(value => toCents(value) / 100);
export const positiveMoney = money.refine(value => value > 0, 'Valor deve ser positivo');
export const nonnegativeMoney = money.refine(value => value >= 0, 'Valor não pode ser negativo');
export const date = z.string().refine(validDate, 'Data inválida');
export const optionalId = z.string().uuid().nullable().optional();
const label = z.string().trim().min(1).max(255);
export const accountSchema = z.object({
  name: label, type: z.enum(['checking','savings','credit_card','investment','wallet']),
  institution: z.string().max(255).nullable().optional(), balance: money, balance_date: date,
  account_type: z.enum(['personal','business']).optional(), credit_limit: nonnegativeMoney.nullable().optional(),
  closing_day: z.number().int().min(1).max(31).nullable().optional(), due_day: z.number().int().min(1).max(31).nullable().optional(),
  color: z.string().max(30).optional(), icon: z.string().max(30).optional(), is_active: z.boolean().optional(),
}).strict();
export const categorySchema = z.object({name:label, type:z.enum(['income','expense','both']),
  icon:z.string().max(30).optional(),color:z.string().max(30).optional(),parent_id:optionalId,
  nature:z.enum(['fixed','variable','future','income','adjustments']).nullable().optional(),
  group_name:z.string().max(100).nullable().optional(),subcategories:z.array(z.string().max(100)).max(100).optional(),
}).strict();
export const economicKinds = ['standard','transfer','card_payment','investment_principal','refund','loan_principal','owner_contribution','owner_withdrawal'];
export const transactionSchema = z.object({description:label, amount:money, type:z.enum(['income','expense','transfer']), date,
  account_id:z.string().uuid(), category_id:optionalId, member_id:optionalId,
  subcategory:z.string().max(100).nullable().optional(), notes:z.string().max(2000).nullable().optional(),
  payment_method:z.enum(['pix','debit','credit','cash','boleto','transfer']).nullable().optional(),
  economic_kind:z.enum(economicKinds).optional(), reversal_of:optionalId,
}).strict();
export const goalSchema=z.object({name:label,target_amount:positiveMoney,current_amount:nonnegativeMoney.optional(),deadline:date.nullable().optional(),
  icon:z.string().max(30).optional(),color:z.string().max(30).optional(),status:z.enum(['active','completed','paused']).optional()}).strict();
export const debtSchema=z.object({name:label,type:z.enum(['personal_loan','financing','credit_card_debt','overdraft','other']),creditor:label,
  original_amount:positiveMoney,current_balance:nonnegativeMoney.optional(),start_date:date.optional(),interest_rate:z.coerce.number().min(0).max(1000).optional(),
  total_installments:z.coerce.number().int().min(0).max(1200).optional(),installment_amount:nonnegativeMoney.optional(),due_day:z.coerce.number().int().min(1).max(31).nullable().optional(),
  status:z.enum(['active','paid','negotiating']).optional(),description:z.string().max(2000).nullable().optional()}).strict();
export const recurringSchema=z.object({name:label,amount:positiveMoney,due_day:z.coerce.number().int().min(1).max(31),
  start_date:date, recurrence:z.enum(['weekly','biweekly','monthly','quarterly','yearly']), type:z.enum(['income','expense']).optional(),
  status:z.enum(['active','inactive']).optional(),category_id:optionalId,is_auto_debit:z.boolean().optional(),description:z.string().max(2000).nullable().optional(),adjust_to_business_day:z.boolean().optional()}).strict();
export const ruleSchema=z.object({keyword:z.string().trim().min(3).max(255),category_id:z.string().uuid(),transaction_type:z.enum(['income','expense']).nullable().optional(),
  subcategory:z.string().max(100).nullable().optional(),is_active:z.boolean().optional()}).strict();
export function scopedBody(body) {
  const { workspace, workspace_id, ...fields } = body || {};
  if (workspace && workspace_id && workspace !== workspace_id) throw new RangeError('Espaços conflitantes.');
  return { workspace:workspace || workspace_id, fields };
}

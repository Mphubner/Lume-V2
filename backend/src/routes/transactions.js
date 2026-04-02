import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { supabase } from '../config/supabase.js';
import { logAudit } from './audit.js';

const router = Router();

// Mark the user's cached AI insights as stale whenever financial data changes
async function flagInsightRecalc(userId) {
  await supabase.from('profiles').update({ needs_insight_recalc: true }).eq('id', userId);
}

router.use(authMiddleware);

// GET /api/transactions?month=&year=&type=&category=&account=&member=&search=&page=&limit=&workspace=
router.get('/', async (req, res) => {
  try {
    const { month, year, type, category_id, account_id, member_id, search, import_id, workspace, page = 1, limit = 100, sort = 'date', order = 'desc', uncategorized } = req.query;
    
    let query = supabase
      .from('transactions')
      .select('*, categories(name, icon, color), accounts(name, institution)', { count: 'exact' })
      .eq('user_id', req.user.id)
      .order(sort, { ascending: order === 'asc' });

    // Filtro de status: apenas para a tela de reconciliação que solicita explicitamente
    if (req.query.status === 'pending') {
      query = query.eq('is_reconciled', false);
    }

    if (month && year) {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];
      query = query.gte('date', startDate).lte('date', endDate);
    }
    if (type) query = query.eq('type', type);
    if (uncategorized === 'true') {
      // Find "Outros" category
      const { data: catOutros } = await supabase.from('categories').select('id').eq('name', 'Outros').limit(1).maybeSingle();
      if (catOutros) {
        query = query.or(`category_id.is.null,category_id.eq.${catOutros.id}`);
      } else {
        query = query.is('category_id', null);
      }
    } else if (category_id) {
      query = query.eq('category_id', category_id);
    }
    if (account_id) query = query.eq('account_id', account_id);
    if (member_id) query = query.eq('member_id', member_id);
    if (import_id) query = query.eq('import_id', import_id);
    if (search) query = query.ilike('description', `%${search}%`);

    if (workspace === 'personal') {
      query = query.eq('account_type', 'personal').is('family_id', null);
    } else if (workspace === 'business') {
      query = query.eq('account_type', 'business').is('family_id', null);
    } else if (workspace === 'family') {
      query = query.not('family_id', 'is', null);
    }

    const from = (page - 1) * limit;
    query = query.range(from, from + parseInt(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json(import_id ? data : { transactions: data, total: count, page: parseInt(page), totalPages: Math.ceil(count / limit) });
  } catch (err) {
    console.error('GET /transactions error:', err);
    res.status(500).json({ error: 'Erro ao buscar transações' });
  }
});

// GET /api/transactions/summary?month=&year=&workspace=
router.get('/summary', async (req, res) => {
  try {
    const { month, year, workspace } = req.query;
    let query = supabase.from('transactions').select('amount, type, date, is_internal_transfer, category_id, categories(name, icon, color, nature, group_name)').eq('user_id', req.user.id);

    if (month && year) {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];
      query = query.gte('date', startDate).lte('date', endDate);
    }

    if (workspace === 'personal') {
      query = query.eq('account_type', 'personal').is('family_id', null);
    } else if (workspace === 'business') {
      query = query.eq('account_type', 'business').is('family_id', null);
    } else if (workspace === 'family') {
      query = query.not('family_id', 'is', null);
    }

    const { data, error } = await query;
    if (error) throw error;

    const validData = data.filter(t => !t.is_internal_transfer && t.type !== 'transfer');
    const income = validData.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount), 0);
    const expenses = validData.filter(t => t.type === 'expense').reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
    const transfers = data.filter(t => t.type === 'transfer' || t.is_internal_transfer).reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);

    // Group by category
    const byCategory = {};
    validData.filter(t => t.type === 'expense').forEach(t => {
      const catName = t.categories?.name || 'Outros';
      if (!byCategory[catName]) {
        byCategory[catName] = { name: catName, icon: t.categories?.icon || '📦', color: t.categories?.color || '#94a3b8', total: 0, count: 0 };
      }
      byCategory[catName].total += Math.abs(parseFloat(t.amount));
      byCategory[catName].count++;
    });

    res.json({
      income, expenses, balance: income - expenses, transfers,
      savingsRate: income > 0 ? ((income - expenses) / income * 100).toFixed(1) : 0,
      byCategory: Object.values(byCategory).sort((a, b) => b.total - a.total),
      totalTransactions: data.length,
    });
  } catch (err) {
    console.error('GET /transactions/summary error:', err);
    res.status(500).json({ error: 'Erro ao calcular resumo' });
  }
});

const transactionSchema = z.object({
  description: z.string().min(2, "A descrição deve ter ao menos 2 caracteres").max(255),
  amount: z.number().or(z.string().transform(val => parseFloat(val))),
  type: z.enum(['income', 'expense', 'transfer']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de data inválido (YYYY-MM-DD)"),
  account_id: z.string().uuid().optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  family_id: z.string().uuid().optional().nullable(),
  account_type: z.enum(['personal', 'business']).optional(),
  origin: z.enum(['manual', 'import', 'ai', 'recurring', 'whatsapp']).optional(),
  is_internal_transfer: z.boolean().optional(),
});

// POST /api/transactions
router.post('/', validate(transactionSchema), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .insert({ ...req.body, user_id: req.user.id, is_reconciled: true })
      .select()
      .single();
    if (error) throw error;
    flagInsightRecalc(req.user.id);
    logAudit(req.user.id, 'transaction_created', `Transação criada: ${req.body.description || 'sem descrição'}`, '➕');
    res.status(201).json(data);
  } catch (err) {
    console.error('POST /transactions error:', err);
    res.status(500).json({ error: 'Erro ao criar transação' });
  }
});

// PUT /api/transactions/:id
router.put('/:id', async (req, res) => {
  try {
    // Sync transaction TYPE and is_internal_transfer when category changes natively
    if (req.body.category_id && !req.body.type) {
      const { data: newCat } = await supabase.from('categories').select('nature, group_name').eq('id', req.body.category_id).single();
      if (newCat) {
        if (newCat.nature === 'income') {
          req.body.type = 'income';
          req.body.is_internal_transfer = false;
        } else if (newCat.nature === 'expense') {
          req.body.type = 'expense';
          req.body.is_internal_transfer = false;
        } else if (newCat.nature === 'transfer' || newCat.group_name?.includes('Transfer')) {
          req.body.type = 'transfer';
          req.body.is_internal_transfer = true;
        }
      }
    }

    // Force strict mathematical signs based on the TYPE (whether given by body or synced)
    if (req.body.amount !== undefined) {
      const isIncome = req.body.type === 'income' || (!req.body.type && req.body.category_id && req.body.is_internal_transfer === false); 
      // Safe fallback: If we know the definitive type:
      if (req.body.type === 'income') {
        req.body.amount = Math.abs(parseFloat(req.body.amount));
      } else if (req.body.type === 'expense') {
        req.body.amount = -Math.abs(parseFloat(req.body.amount));
      }
    }

    const { data, error } = await supabase
      .from('transactions')
      .update(req.body)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .single();
    if (error) throw error;
    flagInsightRecalc(req.user.id);
    logAudit(req.user.id, 'transaction_updated', `Transação atualizada: ${data.description || req.params.id}`, '✏️');
    res.json(data);
  } catch (err) {
    console.error('PUT /transactions error:', err);
    res.status(500).json({ error: 'Erro ao atualizar transação' });
  }
});

// DELETE /api/transactions/:id
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    if (error) throw error;
    flagInsightRecalc(req.user.id);
    logAudit(req.user.id, 'transaction_deleted', `Transação excluída: ${req.params.id}`, '🗑️');
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /transactions error:', err);
    res.status(500).json({ error: 'Erro ao excluir transação' });
  }
});

export default router;

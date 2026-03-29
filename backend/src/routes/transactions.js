import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { supabase } from '../config/supabase.js';

const router = Router();
router.use(authMiddleware);

// GET /api/transactions?month=&year=&type=&category=&account=&member=&search=&page=&limit=
router.get('/', async (req, res) => {
  try {
    const { month, year, type, category_id, account_id, member_id, search, import_id, page = 1, limit = 100, sort = 'date', order = 'desc' } = req.query;
    
    let query = supabase
      .from('transactions')
      .select('*, categories(name, icon, color), accounts(name, institution)', { count: 'exact' })
      .eq('user_id', req.user.id)
      .order(sort, { ascending: order === 'asc' });

    if (month && year) {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];
      query = query.gte('date', startDate).lte('date', endDate);
    }
    if (type) query = query.eq('type', type);
    if (category_id) query = query.eq('category_id', category_id);
    if (account_id) query = query.eq('account_id', account_id);
    if (member_id) query = query.eq('member_id', member_id);
    if (import_id) query = query.eq('import_id', import_id); // Filtro do modal de conferência
    if (search) query = query.ilike('description', `%${search}%`);

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

// GET /api/transactions/summary?month=&year=
router.get('/summary', async (req, res) => {
  try {
    const { month, year } = req.query;
    let query = supabase.from('transactions').select('amount, type, date, is_internal_transfer, category_id, categories(name, icon, color)').eq('user_id', req.user.id);

    if (month && year) {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];
      query = query.gte('date', startDate).lte('date', endDate);
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
      .insert({ ...req.body, user_id: req.user.id })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('POST /transactions error:', err);
    res.status(500).json({ error: 'Erro ao criar transação' });
  }
});

// PUT /api/transactions/:id
router.put('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .update(req.body)
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .single();
    if (error) throw error;
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
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /transactions error:', err);
    res.status(500).json({ error: 'Erro ao excluir transação' });
  }
});

export default router;

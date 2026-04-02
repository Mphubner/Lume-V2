import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';

const router = Router();
router.use(authMiddleware);

// GET /api/dashboard — Aggregate all data for the main dashboard
router.get('/', async (req, res) => {
  try {
    const { period, workspace, month, year } = req.query;
    const now = new Date();
    let startDate, endDate;

    if (month && year) {
      // Filtro específico de mês/ano vindo do frontend
      startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];
    } else if (period === 'month') {
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    } else {
      // All period — last 12 months
      const ago = new Date();
      ago.setFullYear(ago.getFullYear() - 1);
      startDate = ago.toISOString().split('T')[0];
      endDate = now.toISOString().split('T')[0];
    }

    let txQuery = supabase.from('transactions').select('amount, type, date, is_internal_transfer, category_id, categories(name, icon, color)').eq('user_id', req.user.id).gte('date', startDate).lte('date', endDate);
    let debtsQuery = supabase.from('debts').select('current_balance, status').eq('user_id', req.user.id);
    let recurringQuery = supabase.from('recurring_bills').select('*').eq('user_id', req.user.id).eq('status', 'active');
    let accountsQuery = supabase.from('accounts').select('balance, account_type, family_id').eq('user_id', req.user.id).eq('is_active', true);
    
    // Apply workspace filter to base queries
    if (workspace === 'personal') {
      txQuery = txQuery.eq('account_type', 'personal').is('family_id', null);
      debtsQuery = debtsQuery.is('family_id', null);
      recurringQuery = recurringQuery.is('family_id', null);
      accountsQuery = accountsQuery.eq('account_type', 'personal').is('family_id', null);
    } else if (workspace === 'business') {
      txQuery = txQuery.eq('account_type', 'business').is('family_id', null);
      debtsQuery = debtsQuery.is('family_id', null);
      recurringQuery = recurringQuery.is('family_id', null);
      accountsQuery = accountsQuery.eq('account_type', 'business').is('family_id', null);
    } else if (workspace === 'family') {
      txQuery = txQuery.not('family_id', 'is', null);
      debtsQuery = debtsQuery.not('family_id', 'is', null);
      recurringQuery = recurringQuery.not('family_id', 'is', null);
      accountsQuery = accountsQuery.not('family_id', 'is', null);
    }

    const [txResult, recurringResult, debtsResult, goalsResult, reserveResult, healthResult, accountsResult] = await Promise.all([
      txQuery,
      recurringQuery,
      debtsQuery,
      supabase.from('goals').select('target_amount, current_amount, status').eq('user_id', req.user.id),
      supabase.from('emergency_reserve').select('*').eq('user_id', req.user.id).single(),
      supabase.from('health_scores').select('total_score, grade, calculated_at').eq('user_id', req.user.id).order('calculated_at', { ascending: false }).limit(1),
      accountsQuery
    ]);

    const accountsData = accountsResult.data || [];
    const trueBalance = accountsData.reduce((s, a) => s + parseFloat(a.balance || 0), 0);

    const txData = txResult.data || [];
    const nonTransfer = txData.filter(t => !t.is_internal_transfer && t.type !== 'transfer');
    const income = nonTransfer.filter(t => t.type === 'income').reduce((s, t) => s + parseFloat(t.amount), 0);
    const expenses = nonTransfer.filter(t => t.type === 'expense').reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
    const transfers = txData.filter(t => t.is_internal_transfer || t.type === 'transfer').reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);

    // By category
    const byCategory = {};
    nonTransfer.filter(t => t.type === 'expense').forEach(t => {
      const cat = t.categories?.name || 'Outros';
      if (!byCategory[cat]) byCategory[cat] = { name: cat, icon: t.categories?.icon || '📦', color: t.categories?.color || '#94a3b8', total: 0 };
      byCategory[cat].total += Math.abs(parseFloat(t.amount));
    });

    // Monthly evolution (last 12 months)
    const monthlyData = {};
    txData.forEach(t => {
      if (t.is_internal_transfer || t.type === 'transfer') return; // Pula transferências internas/PIX próprios
      const month = t.date.substring(0, 7); // YYYY-MM
      if (!monthlyData[month]) monthlyData[month] = { income: 0, expenses: 0 };
      if (t.type === 'income') monthlyData[month].income += parseFloat(t.amount);
      if (t.type === 'expense') monthlyData[month].expenses += Math.abs(parseFloat(t.amount));
    });

    // Upcoming bills (next 14 days)
    const currentDay = now.getDate();
    const upcomingBills = (recurringResult.data || []).filter(b => {
      const dueDay = b.due_day;
      return dueDay >= currentDay && dueDay <= currentDay + 14;
    });

    // --- Cash Flow 30-Day Projection ---
    // Start with the true aggregate balance today
    let runningBalance = trueBalance;
    const cashFlowProjection = [];
    const activeRecurring = recurringResult.data || [];

    for (let i = 0; i < 30; i++) {
        const projectionDate = new Date(now);
        projectionDate.setDate(now.getDate() + i);
        const dayOfMonth = projectionDate.getDate();
        const dateString = projectionDate.toISOString().split('T')[0];

        let dailyIncome = 0;
        let dailyExpense = 0;

        // Check which recurring bills hit today
        activeRecurring.forEach(bill => {
            if (bill.due_day === dayOfMonth) {
                if (bill.type === 'income') dailyIncome += parseFloat(bill.amount);
                else if (bill.type === 'expense') dailyExpense += parseFloat(bill.amount);
            }
        });

        runningBalance += (dailyIncome - dailyExpense);
        
        cashFlowProjection.push({
            date: dateString,
            expectedIncome: dailyIncome,
            expectedExpense: dailyExpense,
            projectedBalance: runningBalance
        });
    }

    res.json({
      stats: {
        income,
        expenses,
        periodBalance: income - expenses,
        balance: trueBalance,
        savingsRate: income > 0 ? parseFloat(((income - expenses) / income * 100).toFixed(1)) : 0,
        transfers,
      },
      byCategory: Object.values(byCategory).sort((a, b) => b.total - a.total),
      monthlyEvolution: Object.entries(monthlyData).sort().map(([month, data]) => ({
        month, ...data, balance: data.income - data.expenses,
      })),
      upcomingBills,
      cashFlowProjection,
      totalDebt: (debtsResult.data || []).filter(d => d.status === 'active').reduce((s, d) => s + parseFloat(d.current_balance || 0), 0),
      goalsProgress: {
        active: (goalsResult.data || []).filter(g => g.status === 'active').length,
        totalSaved: (goalsResult.data || []).reduce((s, g) => s + parseFloat(g.current_amount || 0), 0),
        totalTarget: (goalsResult.data || []).reduce((s, g) => s + parseFloat(g.target_amount || 0), 0),
      },
      emergencyReserve: reserveResult.data || { current_amount: 0, target_amount: 0 },
      healthScore: (healthResult.data || [])[0] || null,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Erro ao carregar dashboard' });
  }
});

export default router;

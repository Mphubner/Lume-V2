import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';

const router = Router();
router.use(authMiddleware);
router.use(adminMiddleware);

// GET /api/admin/kpis
router.get('/kpis', async (req, res) => {
  try {
    const { data: profiles } = await supabase.from('profiles').select('plan, plan_status, created_at, granted_by');
    
    const users = profiles || [];
    const paying = users.filter(u => u.plan_status === 'active' && !u.granted_by);
    const trial = users.filter(u => u.plan_status === 'trial');
    const free = users.filter(u => u.plan_status === 'inactive' || u.granted_by);
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const newUsers = users.filter(u => new Date(u.created_at) >= sevenDaysAgo);

    // Calculate MRR (simplified)
    const planPrices = { individual: 19.90, family: 39.90 };
    const mrr = paying.reduce((s, u) => s + (planPrices[u.plan] || 0), 0);

    res.json({
      mrr,
      arr: mrr * 12,
      payingUsers: paying.length,
      trialUsers: trial.length,
      freeUsers: free.length,
      newUsersWeek: newUsers.length,
      totalUsers: users.length,
      conversionRate: users.length > 0 ? ((paying.length / users.length) * 100).toFixed(1) : 0,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar KPIs' });
  }
});

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const { search } = req.query;
    let query = supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (search) query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
});

// POST /api/admin/grant-access
router.post('/grant-access', async (req, res) => {
  try {
    const { user_id, plan } = req.body;
    const { data, error } = await supabase.from('profiles').update({
      plan: plan || 'family',
      plan_status: 'granted',
      plan_started_at: new Date().toISOString(),
      granted_by: req.user.id,
    }).eq('id', user_id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao conceder acesso' });
  }
});

// GET/PUT /api/admin/settings
router.get('/settings', async (req, res) => {
  try {
    const { data, error } = await supabase.from('platform_settings').select('*');
    if (error) throw error;
    const settings = {};
    data.forEach(s => { settings[s.key] = s.value; });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar configurações' });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const entries = Object.entries(req.body);
    for (const [key, value] of entries) {
      await supabase.from('platform_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar configurações' });
  }
});

// GET /api/admin/traffic
router.get('/traffic', async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data, error } = await supabase.from('page_views').select('*').gte('created_at', thirtyDaysAgo.toISOString());
    if (error) throw error;

    const views = data || [];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const last7 = views.filter(v => new Date(v.created_at) >= sevenDaysAgo);
    const uniqueVisitors7 = new Set(last7.map(v => v.visitor_id)).size;
    const uniqueVisitors30 = new Set(views.map(v => v.visitor_id)).size;

    // Top pages
    const pageCount = {};
    views.forEach(v => { pageCount[v.page] = (pageCount[v.page] || 0) + 1; });

    // Device breakdown
    const deviceCount = { desktop: 0, mobile: 0, tablet: 0 };
    views.forEach(v => { if (v.device_type) deviceCount[v.device_type]++; });

    res.json({
      last7Days: { views: last7.length, unique: uniqueVisitors7 },
      last30Days: { views: views.length, unique: uniqueVisitors30 },
      topPages: Object.entries(pageCount).sort((a, b) => b[1] - a[1]).map(([page, count]) => ({ page, count })),
      devices: deviceCount,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar tráfego' });
  }
});

// ──── PLANS CRUD ────

// GET /api/admin/plans
router.get('/plans', async (req, res) => {
  try {
    const { data, error } = await supabase.from('plans').select('*').order('price', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    // Fallback defaults if table doesn't exist yet
    res.json([
      { id: 'free', name: 'Gratuito', price: 0, max_accounts: 1, max_transactions: 50, features: ['Categorias básicas', '1 conta'], is_active: true },
      { id: 'individual', name: 'Individual', price: 19.90, max_accounts: 5, max_transactions: -1, features: ['Contas ilimitadas', 'IA completa', 'Importação'], is_active: true },
      { id: 'family', name: 'Família', price: 39.90, max_accounts: 10, max_transactions: -1, features: ['Tudo do Individual', 'Até 5 membros', 'Relatórios familiares'], is_active: true },
    ]);
  }
});

// POST /api/admin/plans
router.post('/plans', async (req, res) => {
  try {
    const { name, price, max_accounts, max_transactions, features, is_active } = req.body;
    const { data, error } = await supabase.from('plans').insert({
      name, price: parseFloat(price), max_accounts: parseInt(max_accounts),
      max_transactions: parseInt(max_transactions),
      features: features || [], is_active: is_active !== false,
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar plano: ' + err.message });
  }
});

// PUT /api/admin/plans/:id
router.put('/plans/:id', async (req, res) => {
  try {
    const { name, price, max_accounts, max_transactions, features, is_active } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (price !== undefined) updates.price = parseFloat(price);
    if (max_accounts !== undefined) updates.max_accounts = parseInt(max_accounts);
    if (max_transactions !== undefined) updates.max_transactions = parseInt(max_transactions);
    if (features !== undefined) updates.features = features;
    if (is_active !== undefined) updates.is_active = is_active;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase.from('plans').update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar plano: ' + err.message });
  }
});

// DELETE /api/admin/plans/:id
router.delete('/plans/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('plans').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao excluir plano: ' + err.message });
  }
});

// GET /api/admin/users/:id  — rich subscriber detail
router.get('/users/:id', async (req, res) => {
  try {
    const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', req.params.id).single();
    if (error) throw error;

    // Get transaction count
    const { count: txCount } = await supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('user_id', req.params.id);

    // Get accounts
    const { data: accounts } = await supabase.from('accounts').select('id, name, type, institution, balance').eq('user_id', req.params.id);

    // Get recurring bills count
    const { count: recurringCount } = await supabase.from('recurring_bills').select('*', { count: 'exact', head: true }).eq('user_id', req.params.id);

    res.json({
      ...profile,
      stats: {
        transactionCount: txCount || 0,
        accountCount: (accounts || []).length,
        recurringCount: recurringCount || 0,
      },
      accounts: accounts || [],
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar detalhes do usuário' });
  }
});

export default router;

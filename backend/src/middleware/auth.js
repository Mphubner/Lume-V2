import { supabase } from '../config/supabase.js';

export const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação necessário' });
  }

  const token = authHeader.split(' ')[1];

  if (!supabase) {
    // Demo mode — fake user
    req.user = { id: 'demo-user', email: 'demo@lume.com', role: 'admin' };
    return next();
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      console.error('[AuthMiddleware] Erro ao validar token no Supabase:', error ? error.message : 'Nenhum usuário retornado');
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }

    // Get profile for role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, plan, plan_status')
      .eq('id', user.id)
      .single();

    req.user = {
      id: user.id,
      email: user.email,
      role: profile?.role || 'user',
      plan: profile?.plan || 'free',
      planStatus: profile?.plan_status || 'inactive',
    };
    req.token = token;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Erro interno de autenticação' });
  }
};

export const adminMiddleware = async (req, res, next) => {
  const adminEmails = (process.env.ADMIN_EMAIL || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const userEmail = (req.user.email || '').toLowerCase();

  // Check both: DB role OR env variable match
  const isAdminByRole = req.user.role === 'admin';
  const isAdminByEmail = adminEmails.includes(userEmail);

  if (!isAdminByRole && !isAdminByEmail) {
    return res.status(403).json({ error: 'Acesso restrito a administradores' });
  }

  // If matched by email but DB role is outdated, sync it
  if (isAdminByEmail && !isAdminByRole && supabase) {
    try {
      await supabase.from('profiles').update({ role: 'admin' }).eq('id', req.user.id);
      req.user.role = 'admin';
      console.log(`🔑 Admin role synced for ${userEmail}`);
    } catch (e) {
      // Non-blocking — continue even if sync fails
    }
  }

  next();
};

import { supabase } from '../config/supabase.js';

export const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação necessário' });
  }

  const token = authHeader.split(' ')[1];

  if (!supabase) {
    return res.status(503).json({ error: 'Serviço de autenticação não configurado.' });
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      console.error('[AuthMiddleware] Erro ao validar token no Supabase:', error ? error.message : 'Nenhum usuário retornado');
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }

    // Get profile for role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, plan, plan_status')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) return res.status(503).json({ error: 'Não foi possível verificar suas permissões.' });

    req.user = {
      id: user.id,
      email: user.email,
      emailConfirmed: Boolean(user.email_confirmed_at),
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
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores' });
  }
  next();
};

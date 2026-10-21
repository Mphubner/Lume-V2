import { supabase } from '../config/supabase.js';

export function createAuthMiddleware(client = supabase) { return async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação necessário' });
  }

  const token = authHeader.split(' ')[1];

  if (!client) {
    return res.status(503).json({ error: 'Serviço de autenticação não configurado.' });
  }

  try {
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }

    if (!user.email || !user.email_confirmed_at) return res.status(403).json({ error: 'Confirme seu email para acessar seus dados.', code: 'email_not_confirmed' });

    // Get profile for role
    const { data: profile, error: profileError } = await client
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
  } catch {
    console.error(JSON.stringify({ event: 'auth_verification_failed' }));
    res.status(500).json({ error: 'Erro interno de autenticação' });
  }
}; }

export const authMiddleware = createAuthMiddleware();

export const adminMiddleware = async (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores' });
  }
  next();
};

import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authCallbackError, authDestination, authLink, hasConfirmedEmail } from '../../services/auth';

// Supabase consumes the callback tokens before getSession resolves. Never put tokens in app state or links.
export default function AuthCallbackPage() {
  const location = useLocation();
  const { user, loading, authConfigured, isPasswordRecovery } = useAuth();
  const [callbackError] = useState(() => authCallbackError(location));
  const next = authDestination(location);

  if (loading && !callbackError) return <div className="auth-page"><p role="status">Confirmando seu acesso…</p></div>;
  if (!callbackError && hasConfirmedEmail(user)) return <Navigate to={isPasswordRecovery && !next.startsWith('/resetar-senha') ? '/resetar-senha' : next} replace />;

  return <div className="auth-page"><div className="auth-bg-pattern" /><div className="auth-container auth-container-centered"><div className="auth-form-panel"><div className="auth-form-wrapper">
    <h2>Não foi possível concluir o acesso</h2>
    <p role="alert" style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: '1rem 0' }}>{callbackError || (authConfigured === false ? 'O acesso está temporariamente indisponível neste ambiente.' : 'Este link é inválido, expirou ou já foi utilizado. Entre com email e senha ou solicite um novo link.')}</p>
    <Link to={authLink('/login', next)} className="btn btn-primary">Voltar para login</Link>
    <p style={{ marginTop: '1rem' }}><Link to={authLink('/esqueci-senha', next)} className="auth-link">Solicitar link de recuperação</Link></p>
  </div></div></div></div>;
}

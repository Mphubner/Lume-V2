import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authDestination, authErrorMessage, authLink } from '../../services/auth';
import { Sun, Mail, ArrowRight, ArrowLeft } from 'lucide-react';

export default function ForgotPasswordPage() {
  const { resetPassword, authConfigured } = useAuth();
  const location = useLocation();
  const next = authDestination(location);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) { setError('Informe seu email'); return; }
    setLoading(true);
    setError('');
    try {
      await resetPassword(email.trim(), next);
      setSent(true);
    } catch (failure) { setError(authErrorMessage(failure, 'email')); }
    finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-bg-pattern" />
      <div className="auth-container auth-container-centered">
        <div className="auth-form-panel">
          <div className="auth-form-wrapper" style={{ textAlign: sent ? 'center' : 'left' }}>
            <Link to={authLink('/login', next)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.85rem' }}>
              <ArrowLeft size={16} /> Voltar para login
            </Link>
            <div className="auth-logo-small"><Sun size={28} strokeWidth={1.5} /><span>Lume</span></div>

            {sent ? (
              <>
                <div style={{ fontSize: '4rem', margin: '1rem 0' }}>📬</div>
                <h2 style={{ marginBottom: '0.5rem' }}>Confira seu email</h2>
                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                  Solicitação recebida. Se houver uma conta elegível com <strong style={{ color: 'var(--accent-gold)' }}>{email.trim()}</strong>, você receberá um link para definir uma nova senha.
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.5rem' }}>
                  Não recebeu? Verifique spam ou tente novamente em alguns minutos.
                </p>
                <button type="button" className="auth-submit-btn" onClick={() => { setSent(false); setError(''); }}>
                  <span>Voltar ao formulário</span>
                </button>
              </>
            ) : (
              <>
                <h2>Recupere seu acesso</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                  Informe o email da sua conta para solicitar um link. Se você entrava com Google, use o mesmo email para definir uma senha.
                </p>

                {error && <div className="auth-error" role="alert">{error}</div>}
                {authConfigured === false ? <div className="auth-error" role="alert">A recuperação está temporariamente indisponível neste ambiente. Tente novamente mais tarde.</div> : null}

                <form onSubmit={handleSubmit} className="auth-form">
                  <div className="auth-field">
                    <Mail size={18} className="auth-field-icon" />
                    <input type="email" aria-label="seu@email.com" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" autoFocus required />
                  </div>
                  <button type="submit" className="auth-submit-btn" disabled={loading || authConfigured === false}>
                    {loading ? <span className="spinner" style={{ width: 20, height: 20 }} /> : <><span>Enviar link</span><ArrowRight size={18} /></>}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

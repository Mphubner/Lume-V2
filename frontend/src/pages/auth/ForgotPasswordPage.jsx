import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Sun, Mail, ArrowRight, ArrowLeft } from 'lucide-react';

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
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
      await resetPassword(email);
      setSent(true);
    } catch {
      setError('Erro ao enviar email. Verifique o endereço e tente novamente.');
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-bg-pattern" />
      <div className="auth-container auth-container-centered">
        <div className="auth-form-panel">
          <div className="auth-form-wrapper" style={{ textAlign: sent ? 'center' : 'left' }}>
            <Link to="/login" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.85rem' }}>
              <ArrowLeft size={16} /> Voltar para login
            </Link>
            <div className="auth-logo-small"><Sun size={28} strokeWidth={1.5} /><span>Lume</span></div>

            {sent ? (
              <>
                <div style={{ fontSize: '4rem', margin: '1rem 0' }}>📬</div>
                <h2 style={{ marginBottom: '0.5rem' }}>Email enviado!</h2>
                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                  Enviamos um link para <strong style={{ color: 'var(--accent-gold)' }}>{email}</strong>.
                  <br />Clique no link para redefinir sua senha.
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.5rem' }}>
                  Não recebeu? Verifique spam ou tente novamente em alguns minutos.
                </p>
                <button className="auth-submit-btn" onClick={() => { setSent(false); setEmail(''); }}>
                  <span>Enviar novamente</span>
                </button>
              </>
            ) : (
              <>
                <h2>Esqueceu sua senha?</h2>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                  Sem problemas! Informe seu email e enviaremos um link para redefinir sua senha.
                </p>

                {error && <div className="auth-error">{error}</div>}

                <form onSubmit={handleSubmit} className="auth-form">
                  <div className="auth-field">
                    <Mail size={18} className="auth-field-icon" />
                    <input type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" autoFocus />
                  </div>
                  <button type="submit" className="auth-submit-btn" disabled={loading}>
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

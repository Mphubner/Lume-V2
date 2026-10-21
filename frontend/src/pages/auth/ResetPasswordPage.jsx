import { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authCallbackError, authDestination, authErrorMessage, authLink, hasConfirmedEmail, MIN_PASSWORD_LENGTH } from '../../services/auth';
import { Sun, Lock, Eye, EyeOff, ArrowRight, CheckCircle } from 'lucide-react';

export default function ResetPasswordPage() {
  const { user, loading: authLoading, updatePassword } = useAuth();
  const location = useLocation();
  const next = authDestination(location);
  const [callbackError] = useState(() => authCallbackError(location));
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) { setError('A senha deve ter pelo menos 8 caracteres'); return; }
    if (password !== confirmPassword) { setError('As senhas não coincidem'); return; }
    setLoading(true);
    setError('');
    try {
      await updatePassword(password);
      setSuccess(true);
      setPassword(''); setConfirmPassword('');
    } catch (failure) { setError(authErrorMessage(failure, 'password')); }
    finally { setLoading(false); }
  };

  if (authLoading) return <div className="auth-page"><p role="status">Verificando seu link de recuperação…</p></div>;

  if (callbackError || !hasConfirmedEmail(user)) return <div className="auth-page"><div className="auth-container auth-container-centered"><div className="auth-form-panel"><div className="auth-form-wrapper">
    <h2>Solicite um novo link</h2>
    <p role="alert" style={{ color: 'var(--text-secondary)', margin: '1rem 0', lineHeight: 1.6 }}>{callbackError || 'Abra o link de recuperação enviado ao seu email para definir a senha. O link pode ter expirado.'}</p>
    <Link to={authLink('/esqueci-senha', next)} className="btn btn-primary">Solicitar link de recuperação</Link>
    <p style={{ marginTop: '1rem' }}><Link to={authLink('/login', next)} className="auth-link">Voltar para login</Link></p>
  </div></div></div></div>;

  if (success) {
    return (
      <div className="auth-page">
        <div className="auth-bg-pattern" />
        <div className="auth-container auth-container-centered">
          <div className="auth-form-panel">
            <div className="auth-form-wrapper" style={{ textAlign: 'center' }}>
              <CheckCircle size={64} style={{ color: '#22c55e', marginBottom: '1rem' }} />
              <h2 style={{ marginBottom: '0.5rem' }}>Senha redefinida!</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                Sua senha foi alterada com sucesso. Seu acesso está pronto para continuar.
              </p>
              <Link to={next} className="btn btn-primary">Continuar</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-bg-pattern" />
      <div className="auth-container auth-container-centered">
        <div className="auth-form-panel">
          <div className="auth-form-wrapper">
            <div className="auth-logo-small"><Sun size={28} strokeWidth={1.5} /><span>Lume</span></div>
            <h2>Redefinir senha</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Crie uma nova senha para sua conta.</p>

            {error && <div className="auth-error" role="alert">{error}</div>}

            <form onSubmit={handleSubmit} className="auth-form">
              <div className="auth-field">
                <Lock size={18} className="auth-field-icon" />
                <input type={showPassword ? 'text' : 'password'} aria-label="Nova senha (mínimo 8 caracteres)" placeholder="Nova senha (mínimo 8 caracteres)" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
                <button type="button" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} className="auth-field-toggle" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <div className="auth-field">
                <Lock size={18} className="auth-field-icon" />
                <input type="password" aria-label="Confirme a nova senha" placeholder="Confirme a nova senha" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" required />
              </div>

              {password && (
                <div className="auth-password-strength">
                  <div className={`strength-bar ${password.length >= MIN_PASSWORD_LENGTH ? 'medium' : 'weak'}`} />
                  <span>{password.length >= MIN_PASSWORD_LENGTH ? 'Mínimo de 8 caracteres atendido' : 'Use pelo menos 8 caracteres'}</span>
                </div>
              )}

              <button type="submit" className="auth-submit-btn" disabled={loading}>
                {loading ? <span className="spinner" style={{ width: 20, height: 20 }} /> : <><span>Redefinir senha</span><ArrowRight size={18} /></>}
              </button>
            </form>

            <div className="auth-footer">
              <Link to={authLink('/login', next)} className="auth-link-strong">Voltar para login</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

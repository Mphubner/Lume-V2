import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Sun, Lock, Eye, EyeOff, ArrowRight, CheckCircle } from 'lucide-react';

export default function ResetPasswordPage() {
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 6) { setError('A senha deve ter pelo menos 6 caracteres'); return; }
    if (password !== confirmPassword) { setError('As senhas não coincidem'); return; }
    setLoading(true);
    setError('');
    try {
      await updatePassword(password);
      setSuccess(true);
      setTimeout(() => navigate('/dashboard'), 3000);
    } catch {
      setError('Erro ao redefinir senha. O link pode ter expirado.');
      setLoading(false);
    }
  };

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
                Sua senha foi alterada com sucesso.<br />Redirecionando para o dashboard...
              </p>
              <span className="spinner" />
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

            {error && <div className="auth-error">{error}</div>}

            <form onSubmit={handleSubmit} className="auth-form">
              <div className="auth-field">
                <Lock size={18} className="auth-field-icon" />
                <input type={showPassword ? 'text' : 'password'} placeholder="Nova senha (min. 6 chars)" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
                <button type="button" className="auth-field-toggle" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <div className="auth-field">
                <Lock size={18} className="auth-field-icon" />
                <input type="password" placeholder="Confirme a nova senha" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" />
              </div>

              {password && (
                <div className="auth-password-strength">
                  <div className={`strength-bar ${password.length >= 8 ? 'strong' : password.length >= 6 ? 'medium' : 'weak'}`} />
                  <span>{password.length >= 8 ? '✅ Senha forte' : password.length >= 6 ? '⚠️ Senha ok' : '❌ Muito curta'}</span>
                </div>
              )}

              <button type="submit" className="auth-submit-btn" disabled={loading}>
                {loading ? <span className="spinner" style={{ width: 20, height: 20 }} /> : <><span>Redefinir senha</span><ArrowRight size={18} /></>}
              </button>
            </form>

            <div className="auth-footer">
              <Link to="/login" className="auth-link-strong">Voltar para login</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

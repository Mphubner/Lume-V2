import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Sun, Mail, Lock, Eye, EyeOff, User, ArrowRight } from 'lucide-react';

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

export default function RegisterPage() {
  const { signUp, signIn } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const set = (field, value) => setForm({ ...form, [field]: value });

  const validate = () => {
    if (!form.fullName.trim()) return 'Informe seu nome completo';
    if (!form.email.trim()) return 'Informe seu email';
    if (form.password.length < 6) return 'A senha deve ter pelo menos 6 caracteres';
    if (form.password !== form.confirmPassword) return 'As senhas não coincidem';
    return null;
  };

  const handleGoogleSignup = async () => {
    setLoading(true);
    try { await signIn('google'); } catch { setError('Erro ao cadastrar com Google.'); setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true);
    setError('');
    try {
      await signUp(form.email, form.password, form.fullName);
      setSuccess(true);
    } catch (err) {
      if (err.message.includes('already registered')) setError('Este email já está cadastrado. Faça login.');
      else setError('Erro ao criar conta. Tente novamente.');
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
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📧</div>
              <h2 style={{ marginBottom: '0.5rem' }}>Verifique seu email</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                Enviamos um link de confirmação para <strong style={{ color: 'var(--accent-gold)' }}>{form.email}</strong>.
                <br />Clique no link para ativar sua conta.
              </p>
              <Link to="/login" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }}>
                Voltar para o Login
              </Link>
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
            <div className="auth-form-header">
              <Link to="/login" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.85rem' }}>
                ← Voltar para login
              </Link>
              <div className="auth-logo-small"><Sun size={28} strokeWidth={1.5} /><span>Lume</span></div>
              <h2>Crie sua conta</h2>
              <p>Comece a organizar suas finanças hoje</p>
            </div>

            {error && <div className="auth-error">{error}</div>}

            <button className="auth-google-btn" onClick={handleGoogleSignup} disabled={loading}>
              <GoogleIcon />
              <span>Cadastrar com Google</span>
            </button>

            <div className="auth-divider"><span>ou cadastre com email</span></div>

            <form onSubmit={handleSubmit} className="auth-form">
              <div className="auth-field">
                <User size={18} className="auth-field-icon" />
                <input type="text" placeholder="Nome completo" value={form.fullName} onChange={e => set('fullName', e.target.value)} autoComplete="name" />
              </div>
              <div className="auth-field">
                <Mail size={18} className="auth-field-icon" />
                <input type="email" placeholder="seu@email.com" value={form.email} onChange={e => set('email', e.target.value)} autoComplete="email" />
              </div>
              <div className="auth-field">
                <Lock size={18} className="auth-field-icon" />
                <input type={showPassword ? 'text' : 'password'} placeholder="Crie uma senha (min. 6 chars)" value={form.password} onChange={e => set('password', e.target.value)} autoComplete="new-password" />
                <button type="button" className="auth-field-toggle" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <div className="auth-field">
                <Lock size={18} className="auth-field-icon" />
                <input type="password" placeholder="Confirme a senha" value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} autoComplete="new-password" />
              </div>

              {form.password && (
                <div className="auth-password-strength">
                  <div className={`strength-bar ${form.password.length >= 8 ? 'strong' : form.password.length >= 6 ? 'medium' : 'weak'}`} />
                  <span>{form.password.length >= 8 ? '✅ Senha forte' : form.password.length >= 6 ? '⚠️ Senha ok' : '❌ Muito curta'}</span>
                </div>
              )}

              <button type="submit" className="auth-submit-btn" disabled={loading}>
                {loading ? <span className="spinner" style={{ width: 20, height: 20 }} /> : <><span>Criar conta</span><ArrowRight size={18} /></>}
              </button>
            </form>

            <div className="auth-footer">
              <span>Já tem uma conta?</span>
              <Link to="/login" className="auth-link-strong">Fazer login</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

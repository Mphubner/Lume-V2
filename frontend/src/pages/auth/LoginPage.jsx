import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Sun, Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

export default function LoginPage() {
  const { signIn, signInWithEmail, isDemoMode } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleLogin = () => {
    setLoading(true);
    setError('');
    signIn('google').catch((err) => {
      console.error(err);
      setError(`Erro Google: ${err.message || 'Bloqueado pelo navegador'}`);
      setLoading(false);
    });
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) { setError('Preencha todos os campos'); return; }
    setLoading(true);
    setError('');
    try {
      await signInWithEmail(email, password);
      navigate('/dashboard');
    } catch (err) {
      const msg = err.message;
      if (msg.includes('Invalid login')) setError('Email ou senha incorretos.');
      else if (msg.includes('Email not confirmed')) setError('Confirme seu email antes de fazer login. Verifique sua caixa de entrada.');
      else setError('Erro ao fazer login. Tente novamente.');
      setLoading(false);
    }
  };

  const handleDemoLogin = () => {
    navigate('/dashboard');
  };

  return (
    <div className="auth-page">
      <div className="auth-bg-pattern" />
      <div className="auth-container">
        {/* Left panel — branding */}
        <div className="auth-brand-panel">
          <div className="auth-brand-content">
            <div className="auth-logo">
              <Sun size={48} strokeWidth={1.5} />
              <h1>Lume</h1>
            </div>
            <p className="auth-brand-tagline">Clareza financeira para sua vida.</p>
            <div className="auth-brand-features">
              <div className="auth-feature">
                <span className="auth-feature-icon">📊</span>
                <div><strong>Dashboard Inteligente</strong><br /><span>Visualize toda sua vida financeira em um só lugar</span></div>
              </div>
              <div className="auth-feature">
                <span className="auth-feature-icon">🤖</span>
                <div><strong>IA Integrada</strong><br /><span>Categorização automática e insights personalizados</span></div>
              </div>
              <div className="auth-feature">
                <span className="auth-feature-icon">🎯</span>
                <div><strong>Metas & Planejamento</strong><br /><span>Defina e acompanhe seus objetivos financeiros</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* Right panel — form */}
        <div className="auth-form-panel">
          <div className="auth-form-wrapper">
            <div className="auth-form-header">
              <h2>Bem-vindo de volta</h2>
              <p>Entre na sua conta para continuar</p>
            </div>

            {error && <div className="auth-error">{error}</div>}

            {/* Google OAuth */}
            <button className="auth-google-btn" onClick={handleGoogleLogin} disabled={loading}>
              <GoogleIcon />
              <span>Continuar com Google</span>
            </button>

            <div className="auth-divider">
              <span>ou entre com email</span>
            </div>

            {/* Email/Password form */}
            <form onSubmit={handleEmailLogin} className="auth-form">
              <div className="auth-field">
                <Mail size={18} className="auth-field-icon" />
                <input
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div className="auth-field">
                <Lock size={18} className="auth-field-icon" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Sua senha"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button type="button" className="auth-field-toggle" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <div className="auth-form-actions">
                <Link to="/esqueci-senha" className="auth-link">Esqueci minha senha</Link>
              </div>

              <button type="submit" className="auth-submit-btn" disabled={loading}>
                {loading ? <span className="spinner" style={{ width: 20, height: 20 }} /> : <><span>Entrar</span><ArrowRight size={18} /></>}
              </button>
            </form>

            <div className="auth-footer">
              <span>Não tem uma conta?</span>
              <Link to="/cadastro" className="auth-link-strong">Criar conta grátis</Link>
            </div>

            {isDemoMode && (
              <button className="auth-demo-btn" onClick={handleDemoLogin}>
                🎮 Entrar em modo demonstração
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

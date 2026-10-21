import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { authErrorMessage } from '../../services/auth';

export default function ConfirmationNotice({ email, next }) {
  const { resendConfirmation } = useAuth();
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!remaining) return;
    const timer = window.setTimeout(() => setRemaining(value => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining]);

  const resend = async () => {
    setBusy(true); setStatus(''); setError('');
    try {
      await resendConfirmation(email, next);
      setStatus('Solicitação recebida. Se a conta estiver aguardando confirmação, verifique sua caixa de entrada e spam.');
      setRemaining(60);
    } catch (failure) { setError(authErrorMessage(failure, 'email')); }
    finally { setBusy(false); }
  };

  return <div style={{ margin: '1rem 0' }}>
    <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>Confira a caixa de entrada e o spam de <strong>{email}</strong>. Se ainda não tiver um link válido, solicite outra confirmação.</p>
    {error ? <div className="auth-error" role="alert">{error}</div> : null}
    {status ? <p role="status" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{status}</p> : null}
    <button type="button" className="auth-google-btn" onClick={resend} disabled={busy || remaining > 0}>
      {busy ? 'Solicitando…' : remaining > 0 ? `Solicitar novamente em ${remaining}s` : 'Reenviar confirmação'}
    </button>
  </div>;
}

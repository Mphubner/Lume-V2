import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import api from '../../services/api';
export default function InvitationPage() {
  const { user } = useAuth();
  const { refreshWorkspaces } = useWorkspace();
  const { search } = useLocation();
  const token = new URLSearchParams(search).get('token');
  const [message, setMessage] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const accept = async () => { setBusy(true); try { await api.request('/workspaces/invitations/accept', { method: 'POST', body: { token } }); await refreshWorkspaces(); setAccepted(true); setMessage('Convite aceito. O contexto está disponível no seletor.'); } catch (e) { setMessage(e.message); } finally { setBusy(false); } };
  return <main className="card" style={{ maxWidth: 650, margin: '4rem auto' }}><h1>Convite para compartilhar finanças</h1><p>O convite permite ver os dados do contexto indicado por quem convidou você. Aceite apenas se reconhecer a pessoa e a finalidade do compartilhamento.</p>{!token ? <p role="alert">Link de convite inválido.</p> : !user ? <p>Entre com o e-mail do convite e volte a este link para aceitar. <Link to="/login" state={{ from: { pathname: '/convite', search } }}>Entrar</Link></p> : <><p>Você está conectado como {user.email}. O e-mail deve estar confirmado.</p><button className="btn btn-primary" disabled={busy || accepted} onClick={accept}>{busy ? 'Validando…' : 'Aceitar convite'}</button></>}{message && <p role="status">{message}</p>}{accepted && <Link to="/dashboard">Abrir resumo</Link>}</main>;
}

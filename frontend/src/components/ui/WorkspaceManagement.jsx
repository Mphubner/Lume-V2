import { useCallback, useEffect, useState } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import api from '../../services/api';
import DataError from './DataError';
export default function WorkspaceManagement() {
  const { workspaces, refreshWorkspaces } = useWorkspace();
  const [selected, setSelected] = useState('');
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [form, setForm] = useState({ name: '', kind: 'family' });
  const [invite, setInvite] = useState({ email: '', role: 'viewer' });
  const [link, setLink] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const workspace = workspaces.find(w => w.id === selected);
  const loadMembers = useCallback(async () => {
    if (!selected) return;
    try { const [people, pending] = await Promise.all([api.request(`/workspaces/${selected}/members`), workspace?.role === 'owner' ? api.request(`/workspaces/${selected}/invitations`) : []]); setMembers(people); setInvitations(pending); setError(null); }
    catch (e) { setError(e); }
  }, [selected, workspace?.role]);
  useEffect(() => { void loadMembers(); }, [loadMembers]);
  const run = async task => { setBusy(true); setError(null); try { await task(); } catch (e) { setError(e); } finally { setBusy(false); } };
  return <div><h2>Contextos e permissões</h2><p>Contas pessoais permanecem privadas. Cada família e empresa tem membros e permissões próprios. Amigos devem criar seu próprio contexto.</p>
    {error && <DataError error={error} onRetry={loadMembers} />}
    <form className="card" onSubmit={e => { e.preventDefault(); void run(async () => { const result = await api.request('/workspaces', { method: 'POST', body: form }); await refreshWorkspaces(); setSelected(result.id); setForm({ name: '', kind: 'family' }); }); }}><h3>Criar contexto</h3><label>Nome<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label><label>Finalidade<select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}><option value="family">Família</option><option value="business">Empresa</option></select></label><button disabled={busy} className="btn btn-primary">Criar contexto</button></form>
    <label>Gerenciar contexto<select value={selected} onChange={e => { setSelected(e.target.value); setLink(''); setMembers([]); setInvitations([]); }}><option value="">Selecione…</option>{workspaces.map(w => <option key={w.id} value={w.id}>{w.name} · {w.role}</option>)}</select></label>
    {workspace && <div className="card"><h3>{workspace.name}</h3><p>O convite concede acesso às contas deste contexto. Confira o compartilhamento antes de continuar.</p><ul>{members.map(member => <li key={member.user_id}>{member.profiles?.full_name || member.profiles?.email || member.user_id} — {member.role}{workspace.role === 'owner' && member.role !== 'owner' && <><select aria-label={`Permissão de ${member.profiles?.email || member.user_id}`} disabled={busy} value={member.role} onChange={e => run(async () => { await api.request(`/workspaces/${selected}/members/${member.user_id}`, { method: 'PATCH', body: { role: e.target.value } }); await loadMembers(); })}><option value="viewer">Leitura</option><option value="editor">Edição</option></select><button disabled={busy} onClick={() => { if (confirm('Revogar o acesso desta pessoa ao contexto?')) run(async () => { await api.request(`/workspaces/${selected}/members/${member.user_id}`, { method: 'DELETE' }); await loadMembers(); }); }}>Revogar acesso</button></>}</li>)}</ul>
      {workspace.role === 'owner' && <><form onSubmit={e => { e.preventDefault(); run(async () => { const result = await api.request(`/workspaces/${selected}/invitations`, { method: 'POST', body: invite }); setLink(result.invite_url); await loadMembers(); }); }}><h3>Preparar convite</h3><label>E-mail do destinatário<input type="email" required value={invite.email} onChange={e => setInvite({ ...invite, email: e.target.value })} /></label><label>Permissão<select value={invite.role} onChange={e => setInvite({ ...invite, role: e.target.value })}><option value="viewer">Somente leitura</option><option value="editor">Colaborador</option></select></label><button disabled={busy} className="btn btn-primary">Gerar link de convite</button></form>
      {link && <div role="status"><p>Convite preparado. Nenhum e-mail foi enviado. Compartilhe este link com o destinatário; o acesso depende do aceite com o e-mail confirmado.</p><input readOnly aria-label="Link do convite" value={link} onFocus={e => e.target.select()} /><button onClick={() => navigator.clipboard.writeText(link)}>Copiar link</button></div>}
      <h3>Convites</h3><ul>{invitations.map(item => <li key={item.id}>{item.email} — {item.status || 'pendente'} <button disabled={busy} onClick={() => run(async () => { await api.request(`/workspaces/${selected}/invitations/${item.id}`, { method: 'DELETE' }); await loadMembers(); })}>Revogar convite</button></li>)}</ul></>}
    </div>}
  </div>;
}

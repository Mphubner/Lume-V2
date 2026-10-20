import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { queryClient } from '../src/services/queryClient';
import api from '../src/services/api';
const auth = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn(), signOut: vi.fn() }));
vi.mock('../src/services/supabase', () => ({ supabase: { auth } }));
vi.mock('../src/services/api', () => ({ default: { sessionId: null, workspace: 'all', token: null, setToken(value) { this.token = value; }, getProfile: vi.fn() } }));
function Probe() {
  const { user, profile, loading, signOut } = useAuth();
  return <div><p>User:{user?.id || 'anonymous'}</p><p>Profile:{profile?.full_name || 'none'}</p><p>Loading:{String(loading)}</p><button onClick={signOut}>Sair</button></div>;
}
const session = id => ({ user: { id }, access_token: `token-${id}` });
describe('Identidade: cache e respostas fora de ordem', () => {
  let authChanged;
  beforeEach(() => {
    queryClient.clear(); api.sessionId = null; api.workspace = 'all';
    auth.getSession.mockResolvedValue({ data: { session: null } });
    auth.onAuthStateChange.mockImplementation(callback => { authChanged = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; });
    auth.signOut.mockResolvedValue({ error: null });
    api.getProfile.mockResolvedValue({ full_name: 'Marcos' });
  });
  it('sair limpa cache, perfil, token e contexto antes de outra sessão', async () => {
    auth.getSession.mockResolvedValue({ data: { session: session('Marcos') } });
    render(<AuthProvider><Probe /></AuthProvider>); await screen.findByText('Profile:Marcos');
    queryClient.setQueryData(['private-ledger'], { amount: 500 }); api.workspace = 'family-A';
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    await screen.findByText('User:anonymous'); expect(screen.getByText('Profile:none')).toBeTruthy();
    expect(queryClient.getQueryData(['private-ledger'])).toBeUndefined(); expect(api.token).toBeNull(); expect(api.workspace).toBe('all'); expect(api.sessionId).toBeNull();
  });
  it('perfil atrasado do usuário A não sobrescreve a sessão B', async () => {
    let resolveA;
    api.getProfile.mockImplementationOnce(() => new Promise(resolve => { resolveA = resolve; })).mockResolvedValueOnce({ full_name: 'Esposa' });
    render(<AuthProvider><Probe /></AuthProvider>);
    await screen.findByText('Loading:false');
    act(() => { authChanged('SIGNED_IN', session('A')); });
    await waitFor(() => expect(api.getProfile).toHaveBeenCalledOnce());
    await act(async () => { authChanged('SIGNED_IN', session('B')); });
    await screen.findByText('Profile:Esposa');
    await act(async () => { resolveA({ full_name: 'Marcos antigo' }); });
    expect(screen.getByText('User:B')).toBeTruthy(); expect(screen.getByText('Profile:Esposa')).toBeTruthy(); expect(screen.queryByText('Profile:Marcos antigo')).toBeNull();
  });
  it('resposta inicial getSession não restaura sessão antiga depois de novo login', async () => {
    let initial;
    auth.getSession.mockImplementationOnce(() => new Promise(resolve => { initial = resolve; }));
    api.getProfile.mockResolvedValue({ full_name: 'Usuário B' });
    render(<AuthProvider><Probe /></AuthProvider>);
    await act(async () => { authChanged('SIGNED_IN', session('B')); });
    await screen.findByText('User:B');
    await act(async () => { initial({ data: { session: session('A') } }); });
    expect(screen.getByText('User:B')).toBeTruthy(); expect(api.token).toBe('token-B');
  });
});

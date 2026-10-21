import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import ProtectedRoute from '../src/components/auth/ProtectedRoute';
import LoginPage from '../src/pages/auth/LoginPage';
import RegisterPage from '../src/pages/auth/RegisterPage';
import ForgotPasswordPage from '../src/pages/auth/ForgotPasswordPage';
import ResetPasswordPage from '../src/pages/auth/ResetPasswordPage';
import AuthCallbackPage from '../src/pages/auth/AuthCallbackPage';
import { authErrorMessage, safeAuthDestination } from '../src/services/auth';
import api from '../src/services/api';

const auth = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn(), signInWithPassword: vi.fn(), signInWithOAuth: vi.fn(), signUp: vi.fn(), resend: vi.fn(), resetPasswordForEmail: vi.fn(), updateUser: vi.fn(), signOut: vi.fn() }));
vi.mock('../src/services/supabase', () => ({ supabase: { auth }, googleAuthEnabled: false }));
vi.mock('../src/services/api', () => ({ default: { sessionId: null, workspace: 'all', token: null, setToken(value) { this.token = value; }, getProfile: vi.fn() } }));

const confirmed = { id: 'user-1', email: 'marcos@example.test', email_confirmed_at: '2026-10-20T00:00:00Z', identities: [{ id: 'email-1' }] };
const session = { user: confirmed, access_token: 'test-access-token' };
let authChanged;

function OAuthProbe() {
  const { signIn } = useAuth();
  return <button onClick={() => signIn('google').catch(failure => window.dispatchEvent(new CustomEvent('test-auth-error', { detail: failure.code })))}>Google direto</button>;
}

function mount(entry = '/login') {
  return render(<AuthProvider><MemoryRouter initialEntries={[entry]}><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/cadastro" element={<RegisterPage />} />
    <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
    <Route path="/resetar-senha" element={<ResetPasswordPage />} />
    <Route path="/auth/callback" element={<AuthCallbackPage />} />
    <Route path="/dashboard" element={<ProtectedRoute><p>Resumo privado</p></ProtectedRoute>} />
    <Route path="/convite" element={<ProtectedRoute><p>Convite preservado</p></ProtectedRoute>} />
    <Route path="/probe" element={<OAuthProbe />} />
  </Routes></MemoryRouter></AuthProvider>);
}

function fillSignup() {
  fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Marcos Teste' } });
  fireEvent.change(screen.getByLabelText('seu@email.com'), { target: { value: confirmed.email } });
  fireEvent.change(screen.getByLabelText('Crie uma senha (mínimo 8 caracteres)'), { target: { value: 'exemplo-senha-123' } });
  fireEvent.change(screen.getByLabelText('Confirme a senha'), { target: { value: 'exemplo-senha-123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
}

beforeEach(() => {
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  auth.onAuthStateChange.mockImplementation(callback => { authChanged = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; });
  auth.resend.mockResolvedValue({ data: {}, error: null });
  auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  auth.updateUser.mockResolvedValue({ data: { user: confirmed }, error: null });
  api.token = null; api.sessionId = null;
  api.getProfile.mockResolvedValue({ full_name: 'Marcos', onboarding_completed: true });
});

describe('Login e confirmação por email', () => {
  it('prioriza email, oculta Google desligado e não oferece acesso sem identidade', async () => {
    mount('/dashboard');
    await screen.findByText('Bem-vindo de volta');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy();
    expect(screen.queryByText('Continuar com Google')).toBeNull();
    expect(screen.queryByText(/modo demonstração/i)).toBeNull();
    expect(screen.queryByText('Resumo privado')).toBeNull();
    expect(api.getProfile).not.toHaveBeenCalled();
  });

  it('impede OAuth mesmo se um consumidor chamar o provider desligado', async () => {
    const errors = vi.fn(); window.addEventListener('test-auth-error', errors);
    mount('/probe');
    fireEvent.click(screen.getByRole('button', { name: 'Google direto' }));
    await waitFor(() => expect(errors).toHaveBeenCalledOnce());
    expect(errors.mock.calls[0][0].detail).toBe('provider_disabled');
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
    window.removeEventListener('test-auth-error', errors);
  });

  it('entra com email confirmado e mantém o convite após login', async () => {
    auth.signInWithPassword.mockImplementation(async () => { authChanged('SIGNED_IN', session); return { data: { user: confirmed, session }, error: null }; });
    mount({ pathname: '/login', state: { from: { pathname: '/convite', search: '?token=invite-1' } } });
    fireEvent.change(screen.getByLabelText('seu@email.com'), { target: { value: confirmed.email } });
    fireEvent.change(screen.getByLabelText('Sua senha'), { target: { value: 'senha-antiga' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await screen.findByText('Convite preservado');
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: confirmed.email, password: 'senha-antiga' });
    expect(api.token).toBe(session.access_token);
  });

  it('email não confirmado permanece fora dos dados e oferece reenvio', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { code: 'email_not_confirmed', message: 'Email not confirmed' } });
    mount();
    fireEvent.change(screen.getByLabelText('seu@email.com'), { target: { value: confirmed.email } });
    fireEvent.change(screen.getByLabelText('Sua senha'), { target: { value: 'senha-qualquer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await screen.findByRole('button', { name: 'Reenviar confirmação' });
    expect(screen.getByRole('alert').textContent).toContain('Confirme seu email');
    expect(api.token).toBeNull(); expect(api.getProfile).not.toHaveBeenCalled();
  });

  it('não usa token nem carrega perfil de sessão sem email confirmado', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { ...session, user: { ...confirmed, email_confirmed_at: null } } }, error: null });
    mount('/dashboard');
    await screen.findByText('Bem-vindo de volta');
    expect(api.token).toBeNull(); expect(api.getProfile).not.toHaveBeenCalled();
  });
});

describe('Cadastro, duplicidade e reenvio', () => {
  it('cadastro aguarda confirmação real e preserva callback interno', async () => {
    auth.signUp.mockResolvedValue({ data: { user: { ...confirmed, email_confirmed_at: null }, session: null }, error: null });
    mount('/cadastro?next=%2Fconvite%3Ftoken%3Dinvite-1'); fillSignup();
    await screen.findByText('Confirme seu email');
    expect(screen.queryByText(/Enviamos um link/i)).toBeNull();
    expect(auth.signUp.mock.calls[0][0].options.emailRedirectTo).toBe(`${window.location.origin}/auth/callback?next=%2Fconvite%3Ftoken%3Dinvite-1`);
    expect(screen.getByRole('link', { name: 'Voltar para o Login' }).getAttribute('href')).toContain('next=%2Fconvite%3Ftoken%3Dinvite-1');
  });

  it('resposta ofuscada de email existente não é apresentada como email enviado', async () => {
    auth.signUp.mockResolvedValue({ data: { user: { ...confirmed, identities: [] }, session: null }, error: null });
    mount('/cadastro'); fillSignup();
    await screen.findByText('Continue com seu email');
    expect(screen.getByText(/Nenhum novo envio de confirmação foi informado/)).toBeTruthy();
    expect(screen.queryByText(/Enviamos um link/i)).toBeNull();
  });

  it('sessão confirmada retornada no cadastro entra sem afirmar envio', async () => {
    auth.signUp.mockImplementation(async () => { authChanged('SIGNED_IN', session); return { data: { user: confirmed, session }, error: null }; });
    mount('/cadastro'); fillSignup();
    await screen.findByText('Resumo privado');
    expect(screen.queryByText('Confirme seu email')).toBeNull();
  });

  it('reenvio com falha mostra o erro e permite tentar novamente sem sucesso falso', async () => {
    auth.signUp.mockResolvedValue({ data: { user: { ...confirmed, email_confirmed_at: null }, session: null }, error: null });
    auth.resend.mockResolvedValue({ error: { code: 'email_address_not_authorized' } });
    mount('/cadastro'); fillSignup();
    fireEvent.click(await screen.findByRole('button', { name: 'Reenviar confirmação' }));
    await screen.findByText(/serviço de email precisa ser liberado/);
    expect(screen.queryByText(/Solicitação recebida\. Se a conta/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Reenviar confirmação' }).disabled).toBe(false);
    expect(auth.resend).toHaveBeenCalledWith({ type: 'signup', email: confirmed.email, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Fdashboard` } });
  });

  it('reenvio só confirma solicitação aceita e aplica intervalo', async () => {
    auth.signUp.mockResolvedValue({ data: { user: { ...confirmed, email_confirmed_at: null }, session: null }, error: null });
    mount('/cadastro'); fillSignup();
    fireEvent.click(await screen.findByRole('button', { name: 'Reenviar confirmação' }));
    await screen.findByText(/Solicitação recebida\. Se a conta/);
    expect(screen.getByRole('button', { name: /Solicitar novamente em/ }).disabled).toBe(true);
  });

  it('erro explícito de duplicidade orienta entrar/recuperar sem expor erro bruto', async () => {
    auth.signUp.mockResolvedValue({ error: { code: 'user_already_exists', message: 'User already registered' } });
    mount('/cadastro'); fillSignup();
    expect((await screen.findByRole('alert')).textContent).toBe('Se você já tem conta com este email, entre ou recupere a senha.');
  });
});

describe('Recuperação e retorno seguro', () => {
  it('recuperação espera resposta e trata limite sem alegar envio', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: { code: 'over_email_send_rate_limit', status: 429 } });
    mount('/esqueci-senha');
    fireEvent.change(screen.getByLabelText('seu@email.com'), { target: { value: confirmed.email } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Muitas tentativas');
    expect(screen.queryByText('Confira seu email')).toBeNull();
  });

  it('recuperação aceita usa retorno próprio e mantém próximo destino', async () => {
    mount('/esqueci-senha?next=%2Fconvite%3Ftoken%3Dinvite-1');
    fireEvent.change(screen.getByLabelText('seu@email.com'), { target: { value: confirmed.email } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link' }));
    await screen.findByText('Confira seu email');
    expect(screen.getByText(/Se houver uma conta elegível/)).toBeTruthy();
    const redirect = new URL(auth.resetPasswordForEmail.mock.calls[0][1].redirectTo);
    expect(redirect.origin).toBe(window.location.origin);
    expect(redirect.pathname).toBe('/auth/callback');
    expect(redirect.searchParams.get('next')).toBe('/resetar-senha?next=%2Fconvite%3Ftoken%3Dinvite-1');
  });

  it('link expirado não abre formulário nem dashboard com sessão antiga', async () => {
    auth.getSession.mockResolvedValue({ data: { session }, error: null });
    mount('/auth/callback?error=access_denied&error_code=otp_expired&next=%2Fdashboard');
    await screen.findByText('Não foi possível concluir o acesso');
    expect(screen.getByRole('alert').textContent).toContain('inválido ou expirou');
    expect(screen.queryByText('Resumo privado')).toBeNull();
  });

  it('retorno confirmado mantém convite e bloqueia redirecionamento externo', async () => {
    auth.getSession.mockResolvedValue({ data: { session }, error: null });
    mount('/auth/callback?next=%2Fconvite%3Ftoken%3Dinvite-1');
    await screen.findByText('Convite preservado');
    expect(safeAuthDestination('//outside.test/steal')).toBe('/dashboard');
    expect(safeAuthDestination('/\\outside.test/steal')).toBe('/dashboard');
    expect(safeAuthDestination('https://outside.test')).toBe('/dashboard');
    expect(safeAuthDestination('/auth/callback?next=/auth/callback')).toBe('/dashboard');
  });

  it('recuperação sem sessão válida oferece novo link em vez de editar senha', async () => {
    mount('/resetar-senha');
    await screen.findByText('Solicite um novo link');
    expect(screen.queryByRole('button', { name: 'Redefinir senha' })).toBeNull();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('senha só mostra sucesso depois de resposta aceita', async () => {
    auth.getSession.mockResolvedValue({ data: { session }, error: null });
    auth.updateUser.mockResolvedValueOnce({ error: { code: 'same_password' } }).mockResolvedValueOnce({ data: { user: confirmed }, error: null });
    mount('/resetar-senha');
    fireEvent.change(await screen.findByLabelText('Nova senha (mínimo 8 caracteres)'), { target: { value: 'nova-senha-123' } });
    fireEvent.change(screen.getByLabelText('Confirme a nova senha'), { target: { value: 'nova-senha-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }));
    expect((await screen.findByRole('alert')).textContent).toContain('diferente da anterior');
    expect(screen.queryByText('Senha redefinida!')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Redefinir senha' }));
    await screen.findByText('Senha redefinida!');
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'nova-senha-123' });
  });

  it('falha inicial de sessão não prende o login em carregamento', async () => {
    auth.getSession.mockRejectedValue(new Error('Network error'));
    mount('/dashboard');
    await screen.findByText('Bem-vindo de volta');
    await act(async () => {});
    expect(screen.queryByText('Resumo privado')).toBeNull();
  });

  it('erros de Google/SMTP/limite e rede têm instrução útil sem ecoar conteúdo remoto', () => {
    expect(authErrorMessage({ message: 'Unsupported provider: provider is not enabled SECRET' })).toContain('Google está indisponível');
    expect(authErrorMessage({ code: 'email_address_not_authorized', message: 'SECRET' })).toContain('equipe do Lume');
    expect(authErrorMessage({ code: 'over_email_send_rate_limit' })).toContain('Muitas tentativas');
    expect(authErrorMessage({ name: 'AuthRetryableFetchError', message: 'SECRET' })).toContain('conexão');
    expect(authErrorMessage({ message: 'SECRET' })).not.toContain('SECRET');
  });
});

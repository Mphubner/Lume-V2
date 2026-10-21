import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase, googleAuthEnabled } from '../services/supabase';
import { authCallbackUrl, authLink, hasConfirmedEmail } from '../services/auth';
import { queryClient } from '../services/queryClient';
import api from '../services/api';

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(!!supabase);
  const [authError, setAuthError] = useState(() => supabase ? null : new Error('Autenticação não configurada neste ambiente.'));
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const activeId = useRef(null);
  const sessionRevision = useRef(0);
  const profileRevision = useRef(0);
  const loadProfile = useCallback(async () => {
    const id = activeId.current;
    if (!id || !api.token) return;
    const requestSession = api.sessionId;
    const revision = ++profileRevision.current;
    try {
      const data = await api.getProfile();
      if (revision === profileRevision.current && id === activeId.current && requestSession === api.sessionId) { setProfile(data); setAuthError(null); }
    } catch (error) { if (revision === profileRevision.current && id === activeId.current && requestSession === api.sessionId) setAuthError(error); }
  }, []);
  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    const initialRevision = sessionRevision.current;
    const applySession = async (session) => {
      if (!mounted) return;
      const revision = ++sessionRevision.current;
      const confirmed = hasConfirmedEmail(session?.user);
      const nextId = confirmed ? session.user.id : null;
      if (nextId !== activeId.current) {
        activeId.current = nextId;
        api.sessionId = nextId ? `${nextId}:${crypto.randomUUID()}` : null;
        api.workspace = 'all';
        queryClient.clear();
        setProfile(null);
      }
      api.setToken(confirmed ? session?.access_token || null : null);
      setUser(confirmed ? session.user : null);
      setAuthError(session && !confirmed ? Object.assign(new Error('Confirme seu email para entrar.'), { code: 'email_not_confirmed' }) : null);
      setLoading(!!session && confirmed);
      if (session && confirmed) await loadProfile();
      if (mounted && revision === sessionRevision.current) setLoading(false);
    };
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted || sessionRevision.current !== initialRevision) return;
      if (error) { setAuthError(error); setLoading(false); }
      else applySession(data.session);
    }).catch((error) => {
      if (mounted && sessionRevision.current === initialRevision) { setAuthError(error); setLoading(false); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
      if (!session) setIsPasswordRecovery(false);
      void applySession(session);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, [loadProfile]);
  const requireAuth = () => { if (!supabase) throw Object.assign(new Error('Autenticação não configurada.'), { code: 'auth_not_configured' }); };
  const signIn = async (provider = 'google', next = '/dashboard') => {
    requireAuth();
    if (provider !== 'google' || !googleAuthEnabled) throw Object.assign(new Error('Acesso com Google indisponível.'), { code: 'provider_disabled' });
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: authCallbackUrl(next) } });
    if (error) throw error;
  };
  const signInWithEmail = async (email, password) => {
    requireAuth();
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    if (!data?.session || !hasConfirmedEmail(data.user)) throw Object.assign(new Error('Confirme seu email para entrar.'), { code: 'email_not_confirmed' });
    return data;
  };
  const signUp = async (email, password, fullName, next = '/dashboard') => {
    requireAuth();
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: fullName.trim() }, emailRedirectTo: authCallbackUrl(next) } });
    if (error) throw error;
    if (!data?.user) throw new Error('O cadastro não foi confirmado pelo serviço.');
    if (data.session && hasConfirmedEmail(data.user)) return { ...data, status: 'authenticated' };
    if (Array.isArray(data.user.identities) && data.user.identities.length === 0) return { ...data, status: 'existing_account' };
    return { ...data, status: 'confirmation_required' };
  };
  const resendConfirmation = async (email, next = '/dashboard') => {
    requireAuth();
    const { data, error } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: authCallbackUrl(next) } });
    if (error) throw error;
    return data;
  };
  const resetPassword = async (email, next = '/dashboard') => {
    requireAuth();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: authCallbackUrl(authLink('/resetar-senha', next)) });
    if (error) throw error;
  };
  const updatePassword = async (password) => {
    requireAuth();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    setIsPasswordRecovery(false);
  };
  const signOut = async () => {
    sessionRevision.current += 1;
    profileRevision.current += 1;
    activeId.current = null;
    api.sessionId = null;
    api.setToken(null);
    api.workspace = 'all';
    queryClient.clear();
    setUser(null); setProfile(null); setAuthError(null); setLoading(false); setIsPasswordRecovery(false);
    if (supabase) { const { error } = await supabase.auth.signOut(); if (error) throw error; }
  };
  return <AuthContext.Provider value={{ user, profile, loading, authError, authConfigured: Boolean(supabase), isAdmin: profile?.role === 'admin', isDemoMode: false, googleAuthEnabled, isPasswordRecovery, signIn, signInWithEmail, signUp, resendConfirmation, resetPassword, updatePassword, signOut, refreshProfile: loadProfile }}>{children}</AuthContext.Provider>;
}
// The hook shares the provider module to keep the authentication contract together.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

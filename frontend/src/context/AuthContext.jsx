import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabase';
import { queryClient } from '../services/queryClient';
import api from '../services/api';

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(!!supabase);
  const [authError, setAuthError] = useState(() => supabase ? null : new Error('Autenticação não configurada neste ambiente.'));
  const activeId = useRef(null);
  const loadProfile = useCallback(async () => {
    const id = activeId.current;
    const requestSession = api.sessionId;
    try {
      const data = await api.getProfile();
      if (id === activeId.current && requestSession === api.sessionId) { setProfile(data); setAuthError(null); }
    } catch (error) { if (id === activeId.current && requestSession === api.sessionId) setAuthError(error); }
  }, []);
  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    let authRevision = 0;
    const applySession = async (session) => {
      if (!mounted) return;
      const nextId = session?.user.id || null;
      if (nextId !== activeId.current) {
        activeId.current = nextId;
        api.sessionId = nextId ? `${nextId}:${crypto.randomUUID()}` : null;
        api.workspace = 'all';
        queryClient.clear();
        setProfile(null);
      }
      api.setToken(session?.access_token || null);
      setUser(session?.user || null);
      setLoading(!!session);
      if (session) await loadProfile();
      if (mounted && activeId.current === nextId) setLoading(false);
    };
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted || authRevision !== 0) return;
      if (error) { setAuthError(error); setLoading(false); }
      else applySession(data.session);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { authRevision += 1; void applySession(session); });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, [loadProfile]);
  const requireAuth = () => { if (!supabase) throw new Error('Autenticação não configurada.'); };
  const signIn = async (provider = 'google') => {
    requireAuth();
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}/dashboard` } });
    if (error) throw error;
  };
  const signInWithEmail = async (email, password) => {
    requireAuth();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };
  const signUp = async (email, password, fullName) => {
    requireAuth();
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: `${window.location.origin}/login` } });
    if (error) throw error;
    return data;
  };
  const resetPassword = async (email) => {
    requireAuth();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/resetar-senha` });
    if (error) throw error;
  };
  const updatePassword = async (password) => {
    requireAuth();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  };
  const signOut = async () => {
    activeId.current = null;
    api.sessionId = null;
    api.setToken(null);
    api.workspace = 'all';
    queryClient.clear();
    setUser(null); setProfile(null);
    if (supabase) { const { error } = await supabase.auth.signOut(); if (error) throw error; }
  };
  return <AuthContext.Provider value={{ user, profile, loading, authError, isAdmin: profile?.role === 'admin', isDemoMode: false, signIn, signInWithEmail, signUp, resetPassword, updatePassword, signOut, refreshProfile: loadProfile }}>{children}</AuthContext.Provider>;
}
// The hook shares the provider module to keep the authentication contract together.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

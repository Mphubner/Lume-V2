import { createContext, useContext, useState, useEffect } from 'react';
import { supabase, isDemoMode } from '../services/supabase';
import api from '../services/api';

const AuthContext = createContext(null);

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || '';

const DEMO_USER = {
  id: 'demo-user',
  email: 'demo@lume.com',
  user_metadata: { full_name: 'Marcos Pereira' },
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isDemoMode) {
      setUser(DEMO_USER);
      setProfile({
        full_name: 'Marcos Pereira',
        email: 'demo@lume.com',
        role: 'admin',
        plan: 'family',
        plan_status: 'active',
        onboarding_completed: true,
      });
      api.setToken('demo-token');
      setLoading(false);
      return;
    }

    // Get current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
        api.setToken(session.access_token);
        loadProfile();
      }
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // User clicked the reset password link — let ResetPasswordPage handle it
        if (session) {
          setUser(session.user);
          api.setToken(session.access_token);
        }
        return;
      }

      if (session) {
        setUser(session.user);
        api.setToken(session.access_token);
        loadProfile();
      } else {
        setUser(null);
        setProfile(null);
        api.setToken(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async () => {
    try {
      const data = await api.getProfile();
      setProfile(data);
    } catch (err) {
      // Profile may not exist yet (first login before onboarding)
      console.warn('Profile not loaded:', err.message);
    }
  };

  // --- Auth Methods ---

  // OAuth (Google, etc.)
  const signIn = async (provider = 'google') => {
    if (isDemoMode) return;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
        scopes: provider === 'google' ? 'https://www.googleapis.com/auth/calendar.events' : undefined,
      },
    });
    if (error) throw error;
  };

  // Email + Password login
  const signInWithEmail = async (email, password) => {
    if (isDemoMode) return;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  // Email signup
  const signUp = async (email, password, fullName) => {
    if (isDemoMode) return;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
    if (error) throw error;
    return data;
  };

  // Reset password (send email)
  const resetPassword = async (email) => {
    if (isDemoMode) return;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/resetar-senha`,
    });
    if (error) throw error;
  };

  // Update password (after reset)
  const updatePassword = async (newPassword) => {
    if (isDemoMode) return;
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  };

  // Sign out
  const signOut = async () => {
    if (isDemoMode) return;
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  const isAdmin = profile?.role === 'admin' || user?.email === ADMIN_EMAIL;

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      isAdmin,
      isDemoMode,
      signIn,
      signInWithEmail,
      signUp,
      resetPassword,
      updatePassword,
      signOut,
      refreshProfile: loadProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

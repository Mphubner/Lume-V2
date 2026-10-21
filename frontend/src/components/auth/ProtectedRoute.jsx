import DataError from '../ui/DataError';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { hasConfirmedEmail } from '../../services/auth';

export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { user, profile, loading, isAdmin, isPasswordRecovery, authError, refreshProfile } = useAuth();
  const location = useLocation();

  // Still loading auth state
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-dark)' }}>
        <span className="spinner" />
      </div>
    );
  }

  // Not authenticated — redirect to login
  if (!hasConfirmedEmail(user)) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (isPasswordRecovery) return <Navigate to="/resetar-senha" replace />;

  if (authError) return <DataError error={authError} onRetry={refreshProfile} />;

  // Authenticated but onboarding not completed — redirect to onboarding
  if (profile && !profile.onboarding_completed && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  // Admin check
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

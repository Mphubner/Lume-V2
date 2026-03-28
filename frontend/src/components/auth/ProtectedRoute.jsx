import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { user, profile, loading, isAdmin, isDemoMode } = useAuth();
  const location = useLocation();

  // Still loading auth state
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-dark)' }}>
        <span className="spinner" />
      </div>
    );
  }

  // Demo mode — allow everything
  if (isDemoMode) return children;

  // Not authenticated — redirect to login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

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

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import MainLayout from './components/layout/MainLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';

// Public Landing Page
import LandingPage from './pages/landing/LandingPage';

// Auth Pages (public)
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import OnboardingPage from './pages/auth/OnboardingPage';
import CheckoutPage from './pages/auth/CheckoutPage';

// App Pages (protected)
import DashboardPage from './pages/dashboard/DashboardPage';
import AnalyticsPage from './pages/analytics/AnalyticsPage';
import GoalsPage from './pages/goals/GoalsPage';
import BudgetPage from './pages/budget/BudgetPage';
import ReservePage from './pages/reserve/ReservePage';
import InvestmentsPage from './pages/investments/InvestmentsPage';
import HealthPage from './pages/health/HealthPage';
import TransactionsPage from './pages/transactions/TransactionsPage';
import RecurringPage from './pages/recurring/RecurringPage';
import DebtsPage from './pages/debts/DebtsPage';
import ReconciliationPage from './pages/reconciliation/ReconciliationPage';
import ImportPage from './pages/import/ImportPage';
import SettingsPage from './pages/settings/SettingsPage';
import AdminPage from './pages/admin/AdminPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Don't refetch just because user alt-tabbed
      staleTime: 1000 * 60 * 5, // Cache is fresh for 5 minutes
      retry: 1
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
      <WorkspaceProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/cadastro" element={<RegisterPage />} />
          <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
          <Route path="/resetar-senha" element={<ResetPasswordPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />

          {/* Protected routes */}
          <Route element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/metas" element={<GoalsPage />} />
            <Route path="/orcamento" element={<BudgetPage />} />
            <Route path="/reserva" element={<ReservePage />} />
            <Route path="/investimentos" element={<InvestmentsPage />} />
            <Route path="/saude" element={<HealthPage />} />
            <Route path="/lancamentos" element={<TransactionsPage />} />
            <Route path="/contas-fixas" element={<RecurringPage />} />
            <Route path="/pendencias" element={<DebtsPage />} />
            <Route path="/conferir-extratos" element={<ReconciliationPage />} />
            <Route path="/importar" element={<ImportPage />} />
            <Route path="/configuracoes" element={<SettingsPage />} />
            <Route path="/admin" element={
              <ProtectedRoute requireAdmin>
                <AdminPage />
              </ProtectedRoute>
            } />
          </Route>
        </Routes>
      </BrowserRouter>
      </WorkspaceProvider>
    </AuthProvider>
    </QueryClientProvider>
  );
}

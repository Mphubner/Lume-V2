import { lazy, Suspense } from 'react';
import { queryClient } from './services/queryClient';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import MainLayout from './components/layout/MainLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';

const LegalPage = lazy(() => import('./pages/legal/LegalPage'));
const InvitationPage = lazy(() => import('./pages/auth/InvitationPage'));

// Public Landing Page
const LandingPage = lazy(() => import('./pages/landing/LandingPage'));

// Auth Pages (public)
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'));
const AuthCallbackPage = lazy(() => import('./pages/auth/AuthCallbackPage'));
const OnboardingPage = lazy(() => import('./pages/auth/OnboardingPage'));
const CheckoutPage = lazy(() => import('./pages/auth/CheckoutPage'));

// App Pages (protected)
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
const AnalyticsPage = lazy(() => import('./pages/analytics/AnalyticsPage'));
const PlannerPage = lazy(() => import('./pages/planner/PlannerPage'));
const GoalsPage = lazy(() => import('./pages/goals/GoalsPage'));
const BudgetPage = lazy(() => import('./pages/budget/BudgetPage'));
const ReservePage = lazy(() => import('./pages/reserve/ReservePage'));
const InvestmentsPage = lazy(() => import('./pages/investments/InvestmentsPage'));
const HealthPage = lazy(() => import('./pages/health/HealthPage'));
const TransactionsPage = lazy(() => import('./pages/transactions/TransactionsPage'));
const RecurringPage = lazy(() => import('./pages/recurring/RecurringPage'));
const DebtsPage = lazy(() => import('./pages/debts/DebtsPage'));
const ReconciliationPage = lazy(() => import('./pages/reconciliation/ReconciliationPage'));
const ImportPage = lazy(() => import('./pages/import/ImportPage'));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'));
const AdminPage = lazy(() => import('./pages/admin/AdminPage'));



export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
      <WorkspaceProvider>
        <BrowserRouter>
          <Suspense fallback={<div role="status" className="loading-spinner">Carregando…</div>}><Routes>
            <Route path="/" element={<LandingPage />} />
          <Route path="/termos" element={<LegalPage />} /><Route path="/privacidade" element={<LegalPage />} /><Route path="/convite" element={<InvitationPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/cadastro" element={<RegisterPage />} />
          <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
          <Route path="/resetar-senha" element={<ResetPasswordPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
          <Route path="/checkout" element={<ProtectedRoute><CheckoutPage /></ProtectedRoute>} />

          {/* Protected routes */}
          <Route element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/planejador" element={<PlannerPage />} />
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
        <Route path="*" element={<div className="card"><h1>Página não encontrada</h1><a href="/dashboard">Voltar ao resumo</a></div>} /></Routes></Suspense>
      </BrowserRouter>
      </WorkspaceProvider>
    </AuthProvider>
    </QueryClientProvider>
  );
}

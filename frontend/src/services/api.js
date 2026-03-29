const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

class ApiService {
  constructor() {
    this.token = null;
    this._offline = false;
    this._offlineWarned = false;
    this._lastCheck = 0;
  }

  setToken(token) {
    this.token = token;
  }

  async request(endpoint, options = {}) {
    // If backend is known to be offline, skip the fetch entirely
    // Re-check every 30 seconds in case backend comes up
    const now = Date.now();
    if (this._offline && (now - this._lastCheck) < 30000) {
      throw new Error('Backend offline');
    }

    const url = `${API_URL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(this.token && { Authorization: `Bearer ${this.token}` }),
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Erro de rede' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      // Backend is online — reset offline flags
      this._offline = false;
      this._offlineWarned = false;
      return response.json();
    } catch (err) {
      // Detect connection errors (backend offline / demo mode)
      const isConnectionError = err.message === 'Failed to fetch' || err.message === 'Backend offline' || err.name === 'TypeError';
      if (isConnectionError) {
        this._offline = true;
        this._lastCheck = Date.now();
        if (!this._offlineWarned) {
          console.warn('🔶 Lume: Backend offline — usando dados demo. Inicie o backend em localhost:5001 para dados reais.');
          this._offlineWarned = true;
        }
        throw err;
      }
      // For real API errors, still log
      console.error(`API Error [${endpoint}]:`, err.message);
      throw err;
    }
  }

  // Dashboard
  getDashboard(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/dashboard?${qs}`);
  }

  // Profile
  getProfile() { return this.request('/profile'); }
  updateProfile(data) { return this.request('/profile', { method: 'PUT', body: data }); }

  // Transactions
  getTransactions(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/transactions?${qs}`);
  }
  getTransactionSummary(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/transactions/summary?${qs}`);
  }
  createTransaction(data) { return this.request('/transactions', { method: 'POST', body: data }); }
  updateTransaction(id, data) { return this.request(`/transactions/${id}`, { method: 'PUT', body: data }); }
  deleteTransaction(id) { return this.request(`/transactions/${id}`, { method: 'DELETE' }); }

  // Accounts
  getAccounts() { return this.request('/accounts'); }
  createAccount(data) { return this.request('/accounts', { method: 'POST', body: data }); }
  updateAccount(id, data) { return this.request(`/accounts/${id}`, { method: 'PUT', body: data }); }
  deleteAccount(id) { return this.request(`/accounts/${id}`, { method: 'DELETE' }); }

  // Categories
  getCategories() { return this.request('/categories'); }
  createCategory(data) { return this.request('/categories', { method: 'POST', body: data }); }

  // Recurring Bills
  getRecurringBills() { return this.request('/recurring'); }
  createRecurringBill(data) { return this.request('/recurring', { method: 'POST', body: data }); }
  updateRecurringBill(id, data) { return this.request(`/recurring/${id}`, { method: 'PUT', body: data }); }
  deleteRecurringBill(id) { return this.request(`/recurring/${id}`, { method: 'DELETE' }); }

  // Debts
  getDebts() { return this.request('/debts'); }
  createDebt(data) { return this.request('/debts', { method: 'POST', body: data }); }
  updateDebt(id, data) { return this.request(`/debts/${id}`, { method: 'PUT', body: data }); }
  deleteDebt(id) { return this.request(`/debts/${id}`, { method: 'DELETE' }); }

  // Goals
  getGoals() { return this.request('/goals'); }
  createGoal(data) { return this.request('/goals', { method: 'POST', body: data }); }
  updateGoal(id, data) { return this.request(`/goals/${id}`, { method: 'PUT', body: data }); }
  deleteGoal(id) { return this.request(`/goals/${id}`, { method: 'DELETE' }); }

  // Budgets
  getBudgets(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/budgets?${qs}`);
  }
  generateBudget(data) { return this.request('/budgets/generate', { method: 'POST', body: data }); }

  // Health
  getHealthScore() { return this.request('/health'); }
  calculateHealth() { return this.request('/health/calculate', { method: 'POST' }); }

  // AI
  getInsights() { return this.request('/ai/insights', { method: 'POST' }); }
  chat(message) { return this.request('/ai/chat', { method: 'POST', body: { message } }); }
  getAIRules() { return this.request('/ai/rules'); }
  updateAIRule(id, data) { return this.request(`/ai/rules/${id}`, { method: 'PUT', body: data }); }
  deleteAIRule(id) { return this.request(`/ai/rules/${id}`, { method: 'DELETE' }); }

  // Import
  async uploadFile(file, accountId) {
    const formData = new FormData();
    formData.append('file', file);
    if (accountId) formData.append('account_id', accountId);

    const response = await fetch(`${API_URL}/import/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}` },
      body: formData,
    });
    return response.json();
  }
  getImportHistory() { return this.request('/import/history'); }

  // Family / Workspaces
  getFamily() { return this.request('/family'); }
  createFamilyMember(data) { return this.request('/family/members', { method: 'POST', body: data }); }

  // Admin
  getKPIs() { return this.request('/admin/kpis'); }
  getUsers(search) { return this.request(`/admin/users${search ? `?search=${search}` : ''}`); }
  getUserDetail(id) { return this.request(`/admin/users/${id}`); }
  grantAccess(userId, plan) { return this.request('/admin/grant-access', { method: 'POST', body: { user_id: userId, plan } }); }
  getSettings() { return this.request('/admin/settings'); }
  updateSettings(data) { return this.request('/admin/settings', { method: 'PUT', body: data }); }
  getTraffic() { return this.request('/admin/traffic'); }

  // Admin Plans
  getPlans() { return this.request('/admin/plans'); }
  createPlan(data) { return this.request('/admin/plans', { method: 'POST', body: data }); }
  updatePlan(id, data) { return this.request(`/admin/plans/${id}`, { method: 'PUT', body: data }); }
  deletePlan(id) { return this.request(`/admin/plans/${id}`, { method: 'DELETE' }); }
}

export const api = new ApiService();
export default api;

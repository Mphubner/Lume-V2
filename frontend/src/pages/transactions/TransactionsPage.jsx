import { useState, useEffect } from 'react';
import api from '../../services/api';
import StatCard from '../../components/ui/StatCard';
import { formatCurrency, formatDate, getMonthName } from '../../utils/format';
import { Plus, Search, ArrowLeftRight, ChevronLeft, ChevronRight, RefreshCw, Filter } from 'lucide-react';

export default function TransactionsPage() {
  const [activeTab, setActiveTab] = useState('monthly');
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState({ income: 0, expenses: 0, balance: 0, byCategory: [] });
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ description: '', amount: '', type: 'expense', date: new Date().toISOString().split('T')[0], category_id: '', account_type: 'personal' });

  useEffect(() => {
    loadData();
  }, [activeTab, month, year, page, search]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'monthly') {
        const [txResult, sumResult] = await Promise.all([
          api.getTransactions({ month, year, page, limit: 100 }),
          api.getTransactionSummary({ month, year }),
        ]);
        setTransactions(txResult.transactions || []);
        setSummary(sumResult);
        setTotal(txResult.total || 0);
        setTotalPages(txResult.totalPages || 1);
      } else {
        const result = await api.getTransactions({ page, limit: 100, search: search || undefined });
        setTransactions(result.transactions || []);
        setTotal(result.total || 0);
        setTotalPages(result.totalPages || 1);
      }
    } catch {
      // Demo fallback
      setTransactions([
        { id: '1', description: 'TRANSFERENCIA PIX REM: HEY MU LTDA 05/12', amount: 439, type: 'income', date: '2025-12-04', categories: { name: 'Teste', icon: '📦' } },
        { id: '2', description: 'TRANSFERENCIA PIX DES: Jade Santos De Moraes 05/12', amount: -439, type: 'expense', date: '2025-12-04', categories: { name: 'Ajustes', icon: '⚙️' } },
        { id: '3', description: 'TRANSFERENCIA PIX REM: HEY MU LTDA 03/12', amount: 3240, type: 'income', date: '2025-12-02', categories: { name: 'Outros', icon: '📦' } },
        { id: '4', description: 'PIX QR CODE DINAMICO DES: BRASIL VARIEDADES 03/12', amount: -49, type: 'expense', date: '2025-12-02', categories: { name: 'Outros', icon: '📦' } },
      ]);
      setSummary({ income: 3829, expenses: 49, balance: 3779, byCategory: [{ name: 'Outros', total: 49 }] });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const amount = parseFloat(form.amount);
      await api.createTransaction({ ...form, amount: form.type === 'expense' ? -Math.abs(amount) : Math.abs(amount) });
      setShowModal(false);
      setForm({ description: '', amount: '', type: 'expense', date: new Date().toISOString().split('T')[0], category_id: '', account_type: 'personal' });
      loadData();
    } catch (err) {
      alert('Erro ao salvar: ' + err.message);
    }
  };

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
  };

  // Group transactions by date
  const grouped = transactions.reduce((acc, tx) => {
    const date = tx.date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(tx);
    return acc;
  }, {});

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Meus Lançamentos</h1>
          <p>Gerencie e analise suas movimentações financeiras</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> Nova Transação</button>
          <button className="btn btn-secondary" onClick={loadData}><RefreshCw size={16} /> Recalcular</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ width: 'fit-content', marginBottom: '1.5rem' }}>
        {[{ key: 'overview', label: 'Visão Geral' }, { key: 'monthly', label: 'Histórico Mensal' }, { key: 'all', label: 'Todas as Transações' }].map(tab => (
          <button key={tab.key} className={`tab ${activeTab === tab.key ? 'active' : ''}`} onClick={() => setActiveTab(tab.key)}>{tab.label}</button>
        ))}
      </div>

      {/* Monthly Navigation */}
      {activeTab === 'monthly' && (
        <div className="date-nav">
          <button onClick={prevMonth}><ChevronLeft size={20} /></button>
          <h3>📅 {getMonthName(month, year)}</h3>
          <button onClick={nextMonth}><ChevronRight size={20} /></button>
        </div>
      )}

      {/* Search (for "all" tab) */}
      {activeTab === 'all' && (
        <div className="search-input" style={{ marginBottom: '1.5rem', maxWidth: 500 }}>
          <Search size={18} />
          <input placeholder="Buscar transações..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}

      {/* Summary Stats (for monthly) */}
      {activeTab === 'monthly' && (
        <div className="grid grid-3" style={{ marginBottom: '1.5rem' }}>
          <StatCard label="Receitas" value={formatCurrency(summary.income)} variant="income" />
          <StatCard label="Despesas" value={formatCurrency(summary.expenses)} variant="expense" />
          <StatCard label="Saldo" value={formatCurrency(summary.balance)} variant="savings" />
        </div>
      )}

      {/* Info bar */}
      {activeTab === 'all' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            💡 Transferências relacionadas são agrupadas automaticamente
          </span>
        </div>
      )}

      {/* Transaction List */}
      <div className="card">
        {activeTab === 'all' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <strong style={{ fontSize: '0.9rem' }}>{total} transações encontradas</strong>
            <div className="pagination" style={{ padding: 0 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>‹</button>
              <span>Página {page} de {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>›</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="loading-spinner"><div className="spinner" /></div>
        ) : transactions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💰</div>
            <h3>Nenhuma transação encontrada</h3>
            <p>Adicione sua primeira transação ou importe um extrato bancário</p>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> Nova Transação</button>
          </div>
        ) : (
          <div>
            {Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0])).map(([date, txs]) => (
              <div key={date} style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', paddingLeft: '0.25rem' }}>
                  {formatDate(date)}
                </div>
                {txs.map(tx => (
                  <div key={tx.id} className="transaction-item">
                    <div className={`transaction-dot ${tx.type}`} />
                    <div className="transaction-info">
                      <div className="transaction-desc">{tx.description}</div>
                      <div className="transaction-meta">
                        <span>{tx.categories?.icon} {tx.categories?.name || 'Sem categoria'}</span>
                      </div>
                    </div>
                    <div className={`transaction-amount ${tx.type === 'income' || tx.amount > 0 ? 'text-success' : 'text-danger'}`}>
                      {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Transaction Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>+ Nova Transação</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Lançamento manual</p>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: '1.25rem' }}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>Data</label>
                    <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>Tipo</label>
                    <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                      <option value="income">Receita</option>
                      <option value="expense">Despesa</option>
                      <option value="transfer">Transferência</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Descrição *</label>
                  <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Ex: Salário, Supermercado..." required />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Valor * (positivo = entrada, negativo = saída)</label>
                    <input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="R$ 0,00" required />
                  </div>
                  <div className="form-group">
                    <label>Tipo de Conta</label>
                    <select value={form.account_type} onChange={e => setForm({ ...form, account_type: e.target.value })}>
                      <option value="personal">Pessoal</option>
                      <option value="business">Empresarial</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">💾 Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

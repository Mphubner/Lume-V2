import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import api from '../../services/api';
import StatCard from '../../components/ui/StatCard';
import BottomSheet from '../../components/ui/BottomSheet';
import TransactionEditModal from './TransactionEditModal';
import { TransactionsSkeleton } from '../../components/ui/Skeleton';
import InlineCategorySelect from '../../components/ui/InlineCategorySelect';
import { formatCurrency, formatDate, getMonthName } from '../../utils/format';
import { useWorkspace } from '../../context/WorkspaceContext';
import { Plus, Search, ArrowLeftRight, ChevronLeft, ChevronRight, RefreshCw, Filter } from 'lucide-react';

export default function TransactionsPage() {
  const { currentWorkspace } = useWorkspace();
  const location = useLocation();
  const urlParams = new URLSearchParams(location.search);
  const uncategorizedFilter = urlParams.get('category') === 'uncategorized';

  const [activeTab, setActiveTab] = useState(uncategorizedFilter ? 'all' : 'monthly');
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
  const [sorting, setSorting] = useState([]);
  const [categories, setCategories] = useState([]);
  const [editingTx, setEditingTx] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [family, setFamily] = useState([]);
  const [rowSelection, setRowSelection] = useState({});
  const [bulkActionBusy, setBulkActionBusy] = useState(false);
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [bulkEditForm, setBulkEditForm] = useState({ category_id: '', subcategory: '' });

  useEffect(() => {
    loadData();
    loadDropdownParams();
  }, [activeTab, month, year, page, currentWorkspace]); // Reload on workspace change

  // Fetch when search changes (debounce via useQuery would be better, but doing simple here)
  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (currentWorkspace !== 'all') params.workspace = currentWorkspace;

      if (activeTab === 'monthly') {
        const [txResult, sumResult] = await Promise.all([
          api.getTransactions({ month, year, page, limit: 100, ...params }),
          api.getTransactionSummary({ month, year, ...params }),
        ]);
        setTransactions(txResult.transactions || []);
        setSummary(sumResult);
        setTotal(txResult.total || 0);
        setTotalPages(txResult.totalPages || 1);
      } else {
        const extraParams = uncategorizedFilter ? { uncategorized: 'true' } : {};
        const queryParams = { page, limit: 100, ...params, ...extraParams };
        if (search) queryParams.search = search;
        const result = await api.getTransactions(queryParams);
        setTransactions(result.transactions || []);
        setTotal(result.total || 0);
        setTotalPages(result.totalPages || 1);
      }
      setRowSelection({}); // reset selection on new load
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

  const loadDropdownParams = async () => {
    try {
      const [cats, accs, fam] = await Promise.all([
        api.getCategories(),
        api.getAccounts(),
        api.getFamily()
      ]);
      setCategories(cats || []);
      setAccounts(accs || []);
      setFamily(fam?.members || []);
    } catch (err) {
      console.error(err);
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

  // TanStack Table setup
  const columns = [
    {
      id: 'select',
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
          style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
        />
      ),
      cell: ({ row }) => (
        <div onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            onChange={row.getToggleSelectedHandler()}
            style={{ width: '1rem', height: '1rem', cursor: 'pointer' }}
          />
        </div>
      ),
    },
    {
      accessorKey: 'date',
      header: 'Data',
      cell: info => <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{formatDate(info.getValue())}</span>,
    },
    {
      accessorKey: 'description',
      header: 'Descrição',
      cell: info => <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{info.getValue()}</div>,
    },
    {
      id: 'category',
      accessorFn: row => row.categories?.name,
      header: 'Categoria',
      cell: info => {
        const row = info.row.original;
        return (
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <span className="badge" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
              {row.categories?.icon} {row.categories?.name || 'Sem categoria'}
            </span>
            {row.subcategory && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>↳ {row.subcategory}</span>}
          </div>
        );
      }
    },
    {
      accessorKey: 'amount',
      header: 'Valor',
      cell: info => {
        const val = info.getValue();
        const color = (info.row.original.type === 'income' || val > 0) ? 'var(--color-success)' : 'var(--color-danger)';
        return (
          <div style={{ color, fontWeight: 700, textAlign: 'right' }}>
            {val > 0 ? '+' : ''}{formatCurrency(val)}
          </div>
        );
      }
    }
  ];

  const table = useReactTable({
    data: transactions,
    columns,
    state: { sorting, rowSelection },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const selectedRows = table.getSelectedRowModel().flatRows.map(r => r.original);

  const handleBulkDelete = async () => {
    if (selectedRows.length === 0) return;
    if (!window.confirm(`Tem certeza que deseja excluir as ${selectedRows.length} transações selecionadas permanentemente?`)) return;
    
    setBulkActionBusy(true);
    try {
      for (const tx of selectedRows) {
        await api.deleteTransaction(tx.id);
      }
      setRowSelection({});
      loadData();
    } catch (err) {
      alert('Erro ao excluir algumas transações: ' + err.message);
    } finally {
      setBulkActionBusy(false);
    }
  };

  const handleBulkEditSubmit = async (e) => {
    e.preventDefault();
    if (selectedRows.length === 0 || !bulkEditForm.category_id) return;
    
    setBulkActionBusy(true);
    try {
      for (const tx of selectedRows) {
        await api.updateTransaction(tx.id, { 
          category_id: bulkEditForm.category_id,
          subcategory: bulkEditForm.subcategory || null
        });
      }
      setShowBulkEditModal(false);
      setRowSelection({});
      loadData();
    } catch (err) {
      alert('Erro ao atualizar: ' + err.message);
    } finally {
      setBulkActionBusy(false);
    }
  };

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

      <div className="card" style={{ maxWidth: '100%', overflow: 'hidden' }}>
        {activeTab === 'all' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
            <strong style={{ fontSize: '0.9rem' }}>{total} transações encontradas</strong>
            <div className="pagination" style={{ padding: 0 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>‹</button>
              <span>Página {page} de {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>›</button>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ padding: '1rem' }}>
            <TransactionsSkeleton />
          </div>
        ) : transactions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💰</div>
            <h3>Nenhuma transação encontrada</h3>
            <p style={{ maxWidth: '100%' }}>Adicione sua primeira transação ou importe um extrato bancário</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> Nova Transação</button>
            </div>
          </div>
        ) : activeTab === 'all' ? (
          <>
            {selectedRows.length > 0 && (
              <div style={{ 
                padding: '0.75rem 1rem', 
                background: 'var(--color-primary-fade)', 
                borderBottom: '1px solid var(--border-color)', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                borderTopLeftRadius: 'var(--border-radius-lg)',
                borderTopRightRadius: 'var(--border-radius-lg)'
              }}>
                <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                  {selectedRows.length} selecionada(s)
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    className="btn btn-secondary btn-sm" 
                    onClick={() => setShowBulkEditModal(true)}
                    disabled={bulkActionBusy}
                    style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)', background: 'transparent' }}
                  >
                    ✏️ Editar Categorias
                  </button>
                  <button 
                    className="btn btn-secondary btn-sm" 
                    onClick={handleBulkDelete}
                    disabled={bulkActionBusy}
                    style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)', background: 'transparent' }}
                  >
                    {bulkActionBusy ? '...' : '🗑️ Excluir'}
                  </button>
                </div>
              </div>
            )}
            <div className="table-responsive" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'left' }}>
                <thead>
                  {table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id} style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                      {headerGroup.headers.map(header => (
                        <th 
                          key={header.id} 
                          onClick={header.column.getToggleSortingHandler()} 
                          style={{ padding: '1rem', color: 'var(--text-muted)', fontWeight: 600, cursor: header.column.getCanSort() ? 'pointer' : 'default', whiteSpace: 'nowrap', textAlign: header.id === 'amount' ? 'right' : 'left' }}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {{ asc: ' 🔼', desc: ' 🔽' }[header.column.getIsSorted()] ?? null}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map(row => (
                    <tr 
                      key={row.id} 
                      onClick={() => setEditingTx(row.original)}
                      style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s', cursor: 'pointer', background: row.getIsSelected() ? 'var(--bg-secondary)' : 'transparent' }} 
                      className="table-row-hover"
                    >
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id} style={{ padding: '0.75rem 1rem' }}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div>
            {Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0])).map(([date, txs]) => (
              <div key={date} style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', paddingLeft: '0.25rem' }}>
                  {formatDate(date)}
                </div>
                {txs.map(tx => (
                  <div key={tx.id} className="transaction-item" onClick={() => setEditingTx(tx)} style={{ cursor: 'pointer' }}>
                    <div className={`transaction-dot ${tx.type}`} />
                    <div className="transaction-info">
                      <div className="transaction-desc">{tx.description}</div>
                      <div className="transaction-meta" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span className="badge" style={{ padding: '2px 6px', fontSize: '0.7rem' }}>{tx.categories?.icon} {tx.categories?.name || 'Sem categoria'}</span>
                        {tx.subcategory && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                            <span style={{ opacity: 0.5, marginRight: '4px' }}>↳</span> {tx.subcategory}
                          </span>
                        )}
                        <span>· {tx.accounts?.name || 'Manual'}</span>
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

      <BottomSheet isOpen={showModal} onClose={() => setShowModal(false)} title="Nova Transação">
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingBottom: '1rem' }}>
            <div className="grid grid-2" style={{ gap: '1rem' }}>
              <div className="form-group">
                <label>Data</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Tipo</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value, category_id: '' })}>
                  <option value="income">Receita</option>
                  <option value="expense">Despesa</option>
                  <option value="transfer">Transferência</option>
                </select>
              </div>
            </div>
            
            <div className="grid grid-2" style={{ gap: '1rem' }}>
              <div className="form-group">
                <label>Descrição *</label>
                <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Ex: Salário, Supermercado..." required />
              </div>
              <div className="form-group">
                <label>Categoria</label>
                <InlineCategorySelect 
                  categories={categories}
                  value={form.category_id}
                  onChange={(val) => setForm({ ...form, category_id: val, subcategory: '' })}
                  typeFilter={form.type}
                  onCategoryCreated={loadDropdownParams}
                />
              </div>
              <div className="form-group">
                <label>Subcategoria</label>
                <select 
                  value={form.subcategory || ''} 
                  onChange={e => setForm({ ...form, subcategory: e.target.value })}
                  disabled={!form.category_id}
                >
                  <option value="">- Nenhuma -</option>
                  {categories.find(c => c.id === form.category_id)?.subcategories?.map(sub => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-2" style={{ gap: '1rem' }}>
              <div className="form-group">
                <label>Valor * (R$)</label>
                <input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0,00" required />
              </div>
              <div className="form-group">
                <label>Tipo de Conta</label>
                <select value={form.account_type} onChange={e => setForm({ ...form, account_type: e.target.value })}>
                  <option value="personal">Pessoal</option>
                  <option value="business">Empresarial</option>
                </select>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary flex-1" onClick={() => setShowModal(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary flex-1" disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </div>
        </form>
      </BottomSheet>

      <TransactionEditModal
        isOpen={!!editingTx}
        onClose={() => setEditingTx(null)}
        transaction={editingTx}
        categories={categories}
        accounts={accounts}
        family={family}
        onSave={async (id, data) => {
          try {
            await api.updateTransaction(id, data);
            setEditingTx(null);
            loadData();
          } catch (err) { alert('Erro ao salvar: ' + err.message); }
        }}
        onDelete={async (id) => {
          try {
            await api.deleteTransaction(id);
            setEditingTx(null);
            loadData();
          } catch (err) { alert('Erro ao excluir: ' + err.message); }
        }}
        onCategoryCreated={loadDropdownParams}
      />

      {/* Bulk Edit Modal */}
      <BottomSheet isOpen={showBulkEditModal} onClose={() => setShowBulkEditModal(false)} title="Editar Selecionadas em Massa">
        <form onSubmit={handleBulkEditSubmit}>
          <div style={{ paddingBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Você está editando {selectedRows.length} transações simultaneamente. Apenas a categoria e subcategoria serão alteradas.</p>
            
            <div className="form-group">
              <label>Nova Categoria</label>
              <InlineCategorySelect 
                categories={categories}
                value={bulkEditForm.category_id}
                onChange={(val) => setBulkEditForm({ category_id: val, subcategory: '' })}
                onCategoryCreated={loadDropdownParams}
              />
            </div>
            
            <div className="form-group">
              <label>Nova Subcategoria</label>
              <select 
                value={bulkEditForm.subcategory} 
                onChange={e => setBulkEditForm({ ...bulkEditForm, subcategory: e.target.value })}
                disabled={!bulkEditForm.category_id}
              >
                <option value="">- Nenhuma -</option>
                {categories.find(c => c.id === bulkEditForm.category_id)?.subcategories?.map(sub => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary flex-1" onClick={() => setShowBulkEditModal(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary flex-1" disabled={bulkActionBusy || !bulkEditForm.category_id}>{bulkActionBusy ? 'Salvando...' : 'Aplicar'}</button>
            </div>
          </div>
        </form>
      </BottomSheet>
    </div>
  );
}

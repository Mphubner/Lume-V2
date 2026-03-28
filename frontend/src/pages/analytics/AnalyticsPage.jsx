import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWorkspace } from '../../context/WorkspaceContext';
import api from '../../services/api';
import StatCard from '../../components/ui/StatCard';
import { formatCurrency } from '../../utils/format';
import {
  TrendingUp, TrendingDown, Sparkles, Download, PiggyBank,
  ArrowUpRight, ArrowDownRight, BarChart3, Activity, Target, Scale
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, AreaChart, Area, PieChart, Pie, Cell,
  RadialBarChart, RadialBar
} from 'recharts';

const CATEGORY_COLORS = ['#d4a843', '#8b5cf6', '#22c55e', '#f43f5e', '#3b82f6', '#f59e0b', '#ec4899', '#06b6d4', '#64748b', '#f97316'];

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const { currentWorkspace } = useWorkspace();

  // Buscar dados reais do dashboard (que já tem stats + evolução + categorias)
  const { data: dashData, isLoading: loadingDash } = useQuery({
    queryKey: ['analytics-dashboard', currentWorkspace],
    queryFn: async () => {
      const params = {};
      if (currentWorkspace !== 'all') params.workspace = currentWorkspace;
      return await api.getDashboard(params);
    },
    staleTime: 1000 * 60 * 5
  });

  // Buscar dados do mês anterior para comparativo
  const { data: prevData } = useQuery({
    queryKey: ['analytics-prev', currentWorkspace],
    queryFn: async () => {
      const params = { period: 'prev_month' };
      if (currentWorkspace !== 'all') params.workspace = currentWorkspace;
      try { return await api.getDashboard(params); } catch { return null; }
    },
    staleTime: 1000 * 60 * 10
  });

  // Health Score
  const { data: healthData } = useQuery({
    queryKey: ['analytics-health'],
    queryFn: () => api.getHealthScore().catch(() => null),
    staleTime: 1000 * 60 * 10
  });

  const stats = dashData?.stats || { income: 0, expenses: 0, balance: 0, savingsRate: 0 };
  const prevStats = prevData?.stats || { income: 0, expenses: 0, balance: 0 };
  const byCategory = dashData?.byCategory || [];
  const evolution = (dashData?.monthlyEvolution || []).map(m => ({
    ...m,
    monthLabel: new Date(m.month + '-01').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
  }));

  const healthScore = healthData?.latest?.total_score ?? dashData?.healthScore?.total_score ?? 0;
  const healthGrade = healthData?.latest?.grade ?? dashData?.healthScore?.grade ?? '-';

  // Métricas calculadas
  const savingsRate = stats.income > 0 ? ((stats.income - stats.expenses) / stats.income * 100) : 0;
  const incomeVariation = prevStats.income > 0 ? ((stats.income - prevStats.income) / prevStats.income * 100) : 0;
  const expenseVariation = prevStats.expenses > 0 ? ((stats.expenses - prevStats.expenses) / prevStats.expenses * 100) : 0;
  const totalCategories = byCategory.length;
  const topExpenseCategory = byCategory.length > 0 ? byCategory[0] : null;
  const totalExpenses = byCategory.reduce((s, c) => s + c.total, 0);

  // Dados para gráfico radial de savings rate
  const savingsRadial = [{ name: 'Taxa', value: Math.max(0, savingsRate), fill: savingsRate >= 20 ? '#22c55e' : savingsRate >= 10 ? '#f59e0b' : '#f43f5e' }];

  // Empty state component
  const EmptyPanel = ({ icon, title, desc }) => (
    <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>{icon}</div>
      <h3 style={{ fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>{title}</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: 400, margin: '0 auto' }}>{desc}</p>
    </div>
  );

  const hasData = stats.income > 0 || stats.expenses > 0;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Análise Avançada</h1>
          <p>Indicadores financeiros, comparativos e evolução patrimonial</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary btn-sm"><Download size={14} /> Exportar PDF</button>
          <button className="btn btn-secondary btn-sm"><Download size={14} /> Exportar CSV</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ width: 'fit-content', marginBottom: '1.5rem' }}>
        {[
          { key: 'overview', label: '📊 Visão Geral' },
          { key: 'cashflow', label: '💰 Fluxo de Caixa' },
          { key: 'expenses', label: '💳 Despesas' },
          { key: 'indicators', label: '📈 Indicadores' },
        ].map(t => (
          <button key={t.key} className={`tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {/* ═══════════════════════ ABA: VISÃO GERAL ═══════════════════════ */}
      {activeTab === 'overview' && (
        <>
          {/* Indicadores Resumidos */}
          <div className="grid grid-4" style={{ marginBottom: '1.5rem' }}>
            <StatCard
              label="Receitas no Período"
              value={formatCurrency(stats.income)}
              sub={incomeVariation !== 0 ? `${incomeVariation > 0 ? '▲' : '▼'} ${Math.abs(incomeVariation).toFixed(1)}% vs mês anterior` : 'sem comparativo'}
              variant="income"
              icon={<TrendingUp size={18} />}
            />
            <StatCard
              label="Despesas no Período"
              value={formatCurrency(stats.expenses)}
              sub={expenseVariation !== 0 ? `${expenseVariation > 0 ? '▲' : '▼'} ${Math.abs(expenseVariation).toFixed(1)}% vs mês anterior` : 'sem comparativo'}
              variant="expense"
              icon={<TrendingDown size={18} />}
            />
            <StatCard
              label="Resultado Líquido"
              value={formatCurrency(stats.balance)}
              sub={stats.balance >= 0 ? 'saldo positivo' : 'alerta: déficit'}
              variant={stats.balance >= 0 ? 'balance' : 'expense'}
              icon={<Scale size={18} />}
            />
            <StatCard
              label="Taxa de Poupança"
              value={`${savingsRate.toFixed(1)}%`}
              sub={savingsRate >= 20 ? '🟢 Excelente' : savingsRate >= 10 ? '🟡 Regular' : savingsRate > 0 ? '🟠 Baixa' : '🔴 Sem poupança'}
              variant={savingsRate >= 10 ? 'savings' : 'neutral'}
              icon={<PiggyBank size={18} />}
            />
          </div>

          {/* Diagnóstico Rápido + Top Gasto */}
          <div className="grid grid-2" style={{ marginBottom: '1.5rem' }}>
            {/* Health Score Card */}
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '1.5rem' }}>
              <div style={{
                width: 80, height: 80, borderRadius: '50%',
                background: `conic-gradient(${healthScore >= 60 ? 'var(--color-success)' : healthScore >= 40 ? 'var(--color-warning)' : 'var(--color-danger)'} ${healthScore * 3.6}deg, var(--bg-secondary) 0deg)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <div style={{
                  width: 64, height: 64, borderRadius: '50%', background: 'var(--bg-card)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column'
                }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 800, color: healthScore >= 60 ? 'var(--color-success)' : healthScore >= 40 ? 'var(--color-warning)' : 'var(--color-danger)' }}>{healthScore}</span>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>{healthGrade}</span>
                </div>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.25rem' }}>Diagnóstico Financeiro</div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {healthScore >= 60 ? 'Sua saúde financeira está em bom caminho. Continue assim!' :
                   healthScore > 0 ? 'Há áreas que precisam de atenção. Verifique as categorias do diagnóstico.' :
                   'Clique em "Recalcular" no Diagnóstico para obter seu score.'}
                </p>
              </div>
            </div>

            {/* Top Categoria */}
            <div className="card" style={{ padding: '1.5rem' }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '1rem' }}>🏆 Maior Despesa por Categoria</div>
              {topExpenseCategory ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.5rem' }}>{topExpenseCategory.icon || '📦'}</span>
                      <span style={{ fontWeight: 600 }}>{topExpenseCategory.name}</span>
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '1.125rem', color: 'var(--color-danger)' }}>{formatCurrency(topExpenseCategory.total)}</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--bg-secondary)', borderRadius: 4 }}>
                    <div style={{ height: '100%', width: `${totalExpenses > 0 ? (topExpenseCategory.total / totalExpenses * 100) : 0}%`, background: 'linear-gradient(90deg, var(--color-danger), #f97316)', borderRadius: 4, transition: 'width 0.5s ease' }} />
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    {totalExpenses > 0 ? `${(topExpenseCategory.total / totalExpenses * 100).toFixed(1)}% do total de despesas` : ''}
                  </div>
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Importe transações para ver a distribuição dos gastos.</p>
              )}
            </div>
          </div>

          {/* Evolução Mensal */}
          {evolution.length > 0 ? (
            <div className="card">
              <div className="card-header"><h3 className="card-title"><Activity size={18} style={{ color: 'var(--accent-gold)' }} /> Evolução Mensal — Receitas vs Despesas</h3></div>
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={evolution}>
                  <defs>
                    <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                  <XAxis dataKey="monthLabel" stroke="var(--text-muted)" fontSize={12} />
                  <YAxis stroke="var(--text-muted)" fontSize={12} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, color: '#fff' }} formatter={v => formatCurrency(v)} />
                  <Legend formatter={v => v === 'income' ? '🟢 Receitas' : v === 'expenses' ? '🔴 Despesas' : '🟡 Saldo'} />
                  <Area type="monotone" dataKey="income" stroke="#22c55e" fill="url(#incomeGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="expenses" stroke="#f43f5e" fill="url(#expenseGrad)" strokeWidth={2} />
                  <Line type="monotone" dataKey="balance" stroke="var(--accent-gold)" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyPanel icon="📈" title="Sem dados de evolução" desc="Importe seus extratos bancários para visualizar a evolução mensal de receitas e despesas ao longo do tempo." />
          )}
        </>
      )}

      {/* ═══════════════════════ ABA: FLUXO DE CAIXA ═══════════════════════ */}
      {activeTab === 'cashflow' && (
        <>
          {evolution.length > 0 ? (
            <>
              {/* Comparativo Mês Atual vs Anterior */}
              <div className="grid grid-3" style={{ marginBottom: '1.5rem' }}>
                <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid var(--color-success)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Receita Atual</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-success)' }}>{formatCurrency(stats.income)}</div>
                  {incomeVariation !== 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.5rem', fontSize: '0.8rem', color: incomeVariation > 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                      {incomeVariation > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      {Math.abs(incomeVariation).toFixed(1)}% vs mês anterior
                    </div>
                  )}
                </div>
                <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid var(--color-danger)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Despesa Atual</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-danger)' }}>{formatCurrency(stats.expenses)}</div>
                  {expenseVariation !== 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.5rem', fontSize: '0.8rem', color: expenseVariation < 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                      {expenseVariation < 0 ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                      {Math.abs(expenseVariation).toFixed(1)}% vs mês anterior
                    </div>
                  )}
                </div>
                <div className="card" style={{ padding: '1.25rem', borderLeft: `4px solid ${stats.balance >= 0 ? 'var(--accent-gold)' : 'var(--color-danger)'}` }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Resultado</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: stats.balance >= 0 ? 'var(--accent-gold)' : 'var(--color-danger)' }}>{formatCurrency(stats.balance)}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    {stats.balance >= 0 ? '✅ Mês positivo' : '⚠️ Mês deficitário'}
                  </div>
                </div>
              </div>

              {/* Gráfico Entradas vs Saídas */}
              <div className="card">
                <div className="card-header"><h3 className="card-title">Entradas e Saídas — Histórico Mensal</h3></div>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={evolution} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                    <XAxis dataKey="monthLabel" stroke="var(--text-muted)" fontSize={12} />
                    <YAxis stroke="var(--text-muted)" fontSize={12} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, color: '#fff' }} formatter={v => formatCurrency(v)} />
                    <Legend formatter={v => v === 'income' ? '🟢 Receitas' : '🔴 Despesas'} />
                    <Bar dataKey="income" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <EmptyPanel icon="💰" title="Sem dados de fluxo de caixa" desc="Registre ou importe suas transações financeiras para visualizar o fluxo de caixa e comparativos mensais." />
          )}
        </>
      )}

      {/* ═══════════════════════ ABA: DESPESAS ═══════════════════════ */}
      {activeTab === 'expenses' && (
        <>
          {byCategory.length > 0 ? (
            <>
              <div className="grid grid-2" style={{ marginBottom: '1.5rem' }}>
                {/* Donut Chart */}
                <div className="card">
                  <div className="card-header"><h3 className="card-title">Distribuição por Categoria</h3></div>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={byCategory.map(c => ({ name: c.name, value: c.total }))} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3}>
                        {byCategory.map((c, i) => <Cell key={i} fill={c.color || CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={v => formatCurrency(v)} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, color: '#fff' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Ranking de Categorias */}
                <div className="card">
                  <div className="card-header"><h3 className="card-title">Ranking de Gastos</h3></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {byCategory.slice(0, 8).map((cat, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '1.25rem', width: 28, textAlign: 'center' }}>{cat.icon || '📦'}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{cat.name}</span>
                            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{formatCurrency(cat.total)}</span>
                          </div>
                          <div style={{ height: 6, background: 'var(--bg-secondary)', borderRadius: 3 }}>
                            <div style={{ height: '100%', width: `${totalExpenses > 0 ? (cat.total / totalExpenses * 100) : 0}%`, background: cat.color || CATEGORY_COLORS[i % CATEGORY_COLORS.length], borderRadius: 3, transition: 'width 0.5s ease' }} />
                          </div>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: 40, textAlign: 'right' }}>{totalExpenses > 0 ? `${(cat.total / totalExpenses * 100).toFixed(0)}%` : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bar Chart */}
              <div className="card">
                <div className="card-header"><h3 className="card-title">Despesas por Categoria — Visão em Barras</h3></div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={byCategory.slice(0, 10)} layout="vertical" margin={{ left: 100 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                    <XAxis type="number" stroke="var(--text-muted)" fontSize={12} tickFormatter={v => formatCurrency(v)} />
                    <YAxis dataKey="name" type="category" stroke="var(--text-muted)" fontSize={12} width={100} />
                    <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8, color: '#fff' }} formatter={v => formatCurrency(v)} />
                    <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                      {byCategory.slice(0, 10).map((c, i) => <Cell key={i} fill={c.color || CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <EmptyPanel icon="💳" title="Sem dados de despesas" desc="Quando você registrar ou importar transações, verá aqui a distribuição completa por categoria e os rankings dos seus maiores gastos." />
          )}
        </>
      )}

      {/* ═══════════════════════ ABA: INDICADORES ═══════════════════════ */}
      {activeTab === 'indicators' && (
        <>
          {hasData ? (
            <>
              {/* Indicadores-chave */}
              <div className="grid grid-3" style={{ marginBottom: '1.5rem' }}>
                {/* Taxa de Poupança Gauge */}
                <div className="card" style={{ textAlign: 'center', padding: '1.5rem' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>TAXA DE POUPANÇA</div>
                  <div style={{
                    width: 120, height: 120, borderRadius: '50%', margin: '0 auto 0.75rem',
                    background: `conic-gradient(${savingsRate >= 20 ? '#22c55e' : savingsRate >= 10 ? '#f59e0b' : '#f43f5e'} ${Math.max(0, savingsRate) * 3.6}deg, var(--bg-secondary) 0deg)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <div style={{ width: 96, height: 96, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '1.75rem', fontWeight: 800, color: savingsRate >= 20 ? '#22c55e' : savingsRate >= 10 ? '#f59e0b' : '#f43f5e' }}>{savingsRate.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {savingsRate >= 20 ? 'Excelente! Acima de 20%' : savingsRate >= 10 ? 'Regular. Meta: acima de 20%' : 'Atenção: invista em economizar mais'}
                  </div>
                </div>

                {/* Comprometimento de Renda */}
                <div className="card" style={{ textAlign: 'center', padding: '1.5rem' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>COMPROMETIMENTO DA RENDA</div>
                  <div style={{
                    width: 120, height: 120, borderRadius: '50%', margin: '0 auto 0.75rem',
                    background: `conic-gradient(${stats.income > 0 && (stats.expenses / stats.income * 100) <= 70 ? '#22c55e' : '#f43f5e'} ${stats.income > 0 ? Math.min(100, stats.expenses / stats.income * 100) * 3.6 : 0}deg, var(--bg-secondary) 0deg)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <div style={{ width: 96, height: 96, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '1.75rem', fontWeight: 800, color: stats.income > 0 && (stats.expenses / stats.income * 100) <= 70 ? '#22c55e' : '#f43f5e' }}>
                        {stats.income > 0 ? `${(stats.expenses / stats.income * 100).toFixed(0)}%` : '0%'}
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {stats.income > 0 && (stats.expenses / stats.income * 100) <= 70 ? 'Saudável: até 70% da renda' : 'Risco: mais de 70% comprometido'}
                  </div>
                </div>

                {/* Score Geral */}
                <div className="card" style={{ textAlign: 'center', padding: '1.5rem' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>SCORE DE SAÚDE</div>
                  <div style={{
                    width: 120, height: 120, borderRadius: '50%', margin: '0 auto 0.75rem',
                    background: `conic-gradient(${healthScore >= 60 ? '#22c55e' : healthScore >= 40 ? '#f59e0b' : '#f43f5e'} ${healthScore * 3.6}deg, var(--bg-secondary) 0deg)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <div style={{ width: 96, height: 96, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                      <span style={{ fontSize: '1.75rem', fontWeight: 800, color: healthScore >= 60 ? '#22c55e' : healthScore >= 40 ? '#f59e0b' : '#f43f5e' }}>{healthScore}</span>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)' }}>{healthGrade}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {healthScore >= 60 ? 'Bom caminho!' : healthScore > 0 ? 'Precisa melhorar' : 'Calcule seu diagnóstico'}
                  </div>
                </div>
              </div>

              {/* Resumo Financeiro Detalhado */}
              <div className="card" style={{ padding: '1.5rem' }}>
                <h3 className="card-title" style={{ marginBottom: '1.25rem' }}>📋 Resumo Numérico do Período</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  {[
                    { label: 'Total de Receitas', value: formatCurrency(stats.income), color: 'var(--color-success)' },
                    { label: 'Total de Despesas', value: formatCurrency(stats.expenses), color: 'var(--color-danger)' },
                    { label: 'Resultado Líquido', value: formatCurrency(stats.balance), color: stats.balance >= 0 ? 'var(--accent-gold)' : 'var(--color-danger)' },
                    { label: 'Taxa de Poupança', value: `${savingsRate.toFixed(1)}%`, color: savingsRate >= 10 ? 'var(--color-success)' : 'var(--color-danger)' },
                    { label: 'Categorias de Gasto', value: String(totalCategories), color: 'var(--text-primary)' },
                    { label: 'Maior Gasto', value: topExpenseCategory ? `${topExpenseCategory.name}: ${formatCurrency(topExpenseCategory.total)}` : '-', color: 'var(--color-warning)' },
                  ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg-secondary)', borderRadius: 'var(--border-radius-sm)' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{item.label}</span>
                      <span style={{ fontWeight: 700, color: item.color }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <EmptyPanel icon="📈" title="Sem dados para indicadores" desc="Os indicadores financeiros serão preenchidos automaticamente quando houver transações registradas. Importe seus extratos ou adicione lançamentos para começar." />
          )}
        </>
      )}
    </div>
  );
}

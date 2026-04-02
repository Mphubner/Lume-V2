import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import api from '../../services/api';
import StatCard from '../../components/ui/StatCard';
import { DashboardSkeleton } from '../../components/ui/Skeleton';
import { formatCurrency } from '../../utils/format';
import {
  TrendingUp, TrendingDown, Wallet, Sparkles, ArrowRightLeft,
  AlertTriangle, Clock, Lightbulb, RefreshCw, ChevronDown, ChevronUp,
  Settings, Plus
} from 'lucide-react';
import Chart from 'react-apexcharts';


const CATEGORY_COLORS = ['#d4a843', '#8b5cf6', '#22c55e', '#f43f5e', '#3b82f6', '#f59e0b', '#ec4899', '#06b6d4', '#64748b', '#f97316'];

// Dados padrão vazios — sem mocks
const EMPTY_DATA = {
  stats: { income: 0, expenses: 0, balance: 0, savingsRate: 0, transfers: 0 },
  byCategory: [],
  monthlyEvolution: [],
  upcomingBills: [],
  totalDebt: 0,
  goalsProgress: { active: 0, totalSaved: 0, totalTarget: 0 },
  emergencyReserve: { current_amount: 0, target_amount: 0 },
  healthScore: { total_score: 0, grade: '-' },
};

export default function DashboardPage() {
  const { profile } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const [period, setPeriod] = useState('');
  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [expandedInsight, setExpandedInsight] = useState(null);
  const { data: dashboardResult, isLoading: loading } = useQuery({
    queryKey: ['dashboard', currentWorkspace, period],
    queryFn: async () => {
      const params = {};
      if (currentWorkspace !== 'all') params.workspace = currentWorkspace;
      if (period) params.period = period;
      return await api.getDashboard(params);
    },
    staleTime: 1000 * 60 * 5 // Cache valid for 5 mins
  });

  const data = dashboardResult || EMPTY_DATA;

  const loadInsights = async () => {
    setInsightsLoading(true);
    try {
      const result = await api.getInsights();
      setInsights(result.insights || []);
    } catch {
      setInsights(null);
    } finally {
      setInsightsLoading(false);
    }
  };

  const getTotalExpenses = () => data.byCategory.reduce((s, c) => s + c.total, 0);
  const evolutionData = (data.monthlyEvolution || []).map(m => ({
    ...m,
    monthLabel: new Date(m.month + '-01T12:00:00Z').toLocaleDateString('pt-BR', { month: 'short' }),
  }));

  const insightIcons = { optimization: '📉', investment: '📊', debt: '📁', savings: '✨', goal: '🎯' };
  const insightColors = { high: 'var(--color-danger)', medium: 'var(--color-warning)', low: 'var(--color-info)' };

  const donutData = data.byCategory.map(c => ({ name: c.name, value: c.total, icon: c.icon }));

  const donutOptions = {
    chart: { type: 'donut', background: 'transparent', animations: { enabled: true, easing: 'easeinout', speed: 800, animateGradually: { enabled: true, delay: 150 } } },
    labels: donutData.map(c => `${c.icon || ''} ${c.name}`),
    colors: CATEGORY_COLORS.slice(0, donutData.length),
    stroke: { show: false },
    dataLabels: { enabled: false },
    legend: { show: true, position: 'right', labels: { colors: '#94a3b8' }, fontSize: '12px', markers: { width: 10, height: 10, radius: 2 } },
    plotOptions: { pie: { donut: { size: '65%', labels: { show: true, name: { color: '#f1f5f9' }, value: { color: '#f1f5f9', formatter: (v) => formatCurrency(Number(v)) }, total: { show: true, label: 'Total', color: '#94a3b8', formatter: (w) => formatCurrency(w.globals.seriesTotals.reduce((a, b) => a + b, 0)) } } } } },
    tooltip: { theme: 'dark', y: { formatter: (v) => formatCurrency(v) } },
    responsive: [{ breakpoint: 600, options: { legend: { position: 'bottom' } } }],
  };

  const evolutionOptions = {
    chart: { type: 'area', background: 'transparent', toolbar: { show: false }, zoom: { enabled: true, type: 'x' } },
    colors: ['#22c55e', '#f43f5e'],
    dataLabels: { enabled: false },
    stroke: { curve: evolutionData.length >= 2 ? 'smooth' : 'straight', width: 2 },
    xaxis: { categories: evolutionData.map(m => m.monthLabel), labels: { style: { colors: '#94a3b8' } }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { 
      labels: { style: { colors: '#94a3b8' }, formatter: (v) => typeof v === 'number' ? `${(v / 1000).toFixed(0)}k` : v },
      ...(evolutionData.length > 0 && Math.max(...evolutionData.map(d => Number(d.income || 0)), ...evolutionData.map(d => Number(d.expenses || 0))) === 0 && Math.min(...evolutionData.map(d => Number(d.income || 0)), ...evolutionData.map(d => Number(d.expenses || 0))) === 0 ? { min: -1000, max: 1000 } : {})
    },
    grid: { borderColor: 'var(--border-color)', strokeDashArray: 3, xaxis: { lines: { show: true } }, yaxis: { lines: { show: true } } },
    tooltip: { theme: 'dark', y: { formatter: (v) => formatCurrency(v) } },
    legend: { labels: { colors: '#94a3b8' }, markers: { width: 10, height: 10, radius: 2 } },
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 90, 100] } }
  };

  const hasUrgentAlert = data.byCategory.some(c => c.name === 'Outros' && c.total > 0) || data.stats.expenses > data.stats.income;

  if (loading) return <DashboardSkeleton />;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Olá, bem-vindo ao Lume ☀️</h1>
          <p>Clareza sobre suas finanças em tempo real</p>
        </div>
        <div className="page-header-actions">
          <Link to="/admin" className="btn btn-secondary btn-sm"><Settings size={14} /> Configurações</Link>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success)' }} />
            Atualizado agora
          </span>
        </div>
      </div>

      {/* Period Filter */}
      <div className="filter-bar">
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>📅 Período</span>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} style={{ width: 160 }}>
          <option value="">Todo Período</option>
          <option value="month">Este Mês</option>
          <option value="3months">Últimos 3 meses</option>
          <option value="6months">Últimos 6 meses</option>
          <option value="year">Este Ano</option>
        </select>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-4" style={{ marginBottom: '1.5rem' }}>
        <StatCard label="Receitas" value={formatCurrency(data.stats.income)} icon={<TrendingUp size={20} />} variant="income" index={0} />
        <StatCard label="Despesas" value={formatCurrency(data.stats.expenses)} icon={<TrendingDown size={20} />} variant="expense" index={1} alert={hasUrgentAlert} />
        <StatCard label="Seu Saldo" value={formatCurrency(data.stats.balance)} icon={<Wallet size={20} />} variant="balance" index={2} />
        <StatCard label="Quanto Sobrou (%)" value={`${data.stats.savingsRate}%`} sub="do total de receitas" icon={<Sparkles size={20} />} variant="savings" index={3} />
      </div>

      {/* Transfers Info */}
      {data.stats.transfers > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.75rem 1rem',
          background: 'var(--bg-card)',
          borderRadius: 'var(--border-radius-sm)',
          border: '1px solid var(--border-color)',
          marginBottom: '1.5rem',
          fontSize: '0.85rem',
        }}>
          <ArrowRightLeft size={16} style={{ color: 'var(--text-muted)' }} />
          <span>Transferências entre contas: <strong style={{ color: 'var(--accent-gold)' }}>{formatCurrency(data.stats.transfers)}</strong></span>
          <span style={{ color: 'var(--text-muted)' }}>| Não contam como receita ou despesa</span>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-2" style={{ marginBottom: '1.5rem' }}>
        {/* Donut Chart — ApexCharts */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Gastos por Categoria</h3>
          </div>
          {donutData.length > 0 ? (
            <Chart options={donutOptions} series={donutData.map(c => Number(c.value || 0))} type="donut" height={280} />
          ) : (
            <div className="empty-state" style={{ padding: '2rem' }}>
              <p>Sem dados de gastos ainda</p>
            </div>
          )}
        </div>

        {/* Line Chart — ApexCharts Area */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Evolução Mensal</h3>
          </div>
          <Chart 
            options={evolutionOptions} 
            series={[
              { name: 'Receitas', data: evolutionData.map(m => Number(m.income || 0)) },
              { name: 'Despesas', data: evolutionData.map(m => Number(m.expenses || 0)) }
            ]} 
            type="area" 
            height={280} 
          />
        </div>
      </div>

      {/* AI Insights */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <div>
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sparkles size={18} style={{ color: 'var(--accent-purple)' }} /> Insights da IA
            </h3>
            <p className="card-subtitle">Análise inteligente das suas finanças</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={loadInsights} disabled={insightsLoading}>
            {insightsLoading ? <RefreshCw size={14} className="animate-pulse" /> : <Sparkles size={14} />}
            {insightsLoading ? 'Analisando...' : 'Gerar Insights'}
          </button>
        </div>

        {insights && insights.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {insights.map((insight, i) => (
              <div key={i} style={{
                padding: '1rem 1.25rem',
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--border-radius-md)',
                border: '1px solid var(--border-color)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>{insightIcons[insight.type] || '💡'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{insight.title}</div>
                  </div>
                  {insight.potential_savings > 0 && (
                    <span className="badge badge-success">⚡ Potencial: {formatCurrency(insight.potential_savings)}</span>
                  )}
                  <button onClick={() => setExpandedInsight(expandedInsight === i ? null : i)} style={{ background: 'transparent', color: 'var(--text-muted)' }}>
                    {expandedInsight === i ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
                <AnimatePresence>
                  {expandedInsight === i && (
                    <motion.p
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, overflow: 'hidden' }}
                    >
                      {insight.description}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        ) : !insights ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem' }}>
            Clique em "Gerar Insights" para receber análises personalizadas da IA
          </p>
        ) : null}
      </div>

      {/* Alerts */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={18} style={{ color: 'var(--color-warning)' }} /> Alertas Importantes
          </h3>
          <span className="card-subtitle">Ações recomendadas para agora</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {data.byCategory.some(c => c.name === 'Outros' && c.total > 0) && (
            <div className="alert-card urgent">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 600 }}>🔥 Transações sem Categoria</span>
                <span className="badge badge-danger">🔥 Urgente</span>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                Há {formatCurrency(data.byCategory.find(c => c.name === 'Outros')?.total || 0)} em transações sem categoria que podem afetar seu orçamento.
              </p>
              <button className="btn btn-secondary btn-sm" onClick={() => window.location.href='/lancamentos?category=uncategorized'}>Ver Transações →</button>
            </div>
          )}

          {data.stats.balance > 1000 && (
            <div className="alert-card important">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 600 }}>⚠️ Oportunidade de Investimento</span>
                <span className="badge badge-warning">⚠️ Importante</span>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                Avalie a possibilidade de investir {formatCurrency(data.stats.balance)} em Renda Fixa para melhorar seus rendimentos.
              </p>
              <button className="btn btn-secondary btn-sm">Investir Agora →</button>
            </div>
          )}

          {data.goalsProgress.active === 0 && (
            <div className="alert-card suggestion">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 600 }}>📅 Criar Metas Financeiras</span>
                <span className="badge badge-info">💡 Sugestão</span>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                Defina metas financeiras para guiar seus investimentos e gastos futuros.
              </p>
              <button className="btn btn-secondary btn-sm">Definir Metas →</button>
            </div>
          )}
        </div>
      </div>

      {/* Cash Flow Forecast (30 Days) */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">📅 Previsão de Entradas e Saídas (Próx. 30 Dias)</h3>
            <p className="card-subtitle">Baseado nas contas fixas, parcelamentos e saldo inicial: {formatCurrency(data.stats.balance)}</p>
          </div>
        </div>

        {data.cashFlowProjection && data.cashFlowProjection.length > 0 ? (
          <>
            <div className="grid grid-3" style={{ marginBottom: '1.5rem' }}>
              {/* Future metrics calculated from the 30-day array */}
              <div style={{ textAlign: 'center', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: 'var(--border-radius-sm)' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>📉 Saldo Hoje</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>{formatCurrency(data.cashFlowProjection[0].projectedBalance)}</div>
              </div>
              <div style={{ textAlign: 'center', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: 'var(--border-radius-sm)' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>🛡️ Menor Saldo Previsto (30D)</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: Math.min(...data.cashFlowProjection.map(p => p.projectedBalance)) < 0 ? 'var(--color-danger)' : 'var(--color-info)' }}>
                  {formatCurrency(Math.min(...data.cashFlowProjection.map(p => p.projectedBalance)))}
                </div>
              </div>
              <div style={{ textAlign: 'center', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: 'var(--border-radius-sm)' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>✅ Status Operacional</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: Math.min(...data.cashFlowProjection.map(p => p.projectedBalance)) < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                  {Math.min(...data.cashFlowProjection.map(p => p.projectedBalance)) < 0 ? 'Zona de Risco (Ruptura Prevista)' : 'Saudável'}
                </div>
              </div>
            </div>

            <div style={{ height: 250, marginTop: '0.5rem' }}>
              <Chart
                options={{
                  chart: { type: 'area', toolbar: { show: false }, background: 'transparent', fontFamily: 'inherit' },
                  theme: { mode: 'dark' },
                  colors: ['#3b82f6', '#f43f5e', '#22c55e'],
                  stroke: { curve: 'stepline', width: [3, 0, 0] },
                  fill: { type: ['gradient', 'solid', 'solid'], gradient: { shadeIntensity: 1, opacityFrom: 0.25, opacityTo: 0.02, stops: [0, 90, 100] } },
                  dataLabels: { enabled: false },
                  markers: { size: [0, 4, 4], colors: ['#3b82f6', '#f43f5e', '#22c55e'], hover: { size: 6 } },
                  xaxis: { categories: data.cashFlowProjection.map(d => d.date.substring(5, 10).replace('-', '/')), labels: { style: { colors: '#94a3b8' }, rotate: -30 }, axisBorder: { show: false }, axisTicks: { show: false }, tickAmount: 8 },
                  yaxis: { 
                    labels: { formatter: v => typeof v === 'number' ? `${(v/1000).toFixed(0)}k` : v, style: { colors: '#94a3b8' } },
                    ...(Math.max(...data.cashFlowProjection.map(d => Number(d.projectedBalance || 0))) === Math.min(...data.cashFlowProjection.map(d => Number(d.projectedBalance || 0))) ? { min: Math.min(...data.cashFlowProjection.map(d => Number(d.projectedBalance || 0))) - 1000, max: Math.max(...data.cashFlowProjection.map(d => Number(d.projectedBalance || 0))) + 1000 } : {})
                  },
                  grid: { borderColor: '#334155', strokeDashArray: 4 },
                  legend: { labels: { colors: '#f8fafc' } },
                  tooltip: { theme: 'dark', y: { formatter: v => formatCurrency(v) } },
                }}
                series={[
                  { name: 'Saldo Projetado', data: data.cashFlowProjection.map(d => Number(d.projectedBalance || 0)), type: 'area' },
                  { name: 'Saída (Contas Fixas)', data: data.cashFlowProjection.map(d => Number(d.expectedExpense || 0)), type: 'scatter' },
                  { name: 'Entrada (Prevista)', data: data.cashFlowProjection.map(d => Number(d.expectedIncome || 0)), type: 'scatter' },
                ]}
                type="area"
                height="100%"
              />
            </div>
          </>
        ) : (
          <div className="empty-state" style={{ padding: '3rem 2rem', textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: '12px', marginTop: '1rem', border: '1px dashed var(--border-color)' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔮</div>
            <h4 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Projeção de Saldo Inativa</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', maxWidth: '400px', margin: '0 auto 1.5rem', lineHeight: 1.5 }}>
              O Lume pode prever exatamente quanto de dinheiro sobrará na sua conta no fim do mês. Para a IA começar a calcular, basta adicionar suas contas recorrentes (Água, Luz, Aluguel).
            </p>
            <Link to="/contas-fixas" className="btn btn-primary">
              <Plus size={16} /> Adicionar Conta Fixa
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

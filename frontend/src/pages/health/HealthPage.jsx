import DataError from '../../components/ui/DataError';
import { useState, useEffect } from 'react';
import api from '../../services/api';
import StatCard from '../../components/ui/StatCard';
import { Heart, RefreshCw } from 'lucide-react';
import Chart from 'react-apexcharts';

const CATEGORIES = [
  { key: 'savings_rate_score', label: '🔥 Taxa de Poupança', desc: 'Percentual da renda que você consegue economizar' },
  { key: 'debt_management_score', label: '📁 Gestão de Dívidas', desc: 'Quanto das suas dívidas compromete sua renda' },
  { key: 'emergency_reserve_score', label: '🛡️ Reserva de Emergência', desc: 'Tempo que consegue sobreviver sem renda' },
  { key: 'diversification_score', label: '📊 Diversificação', desc: 'Nível de diversificação dos investimentos' },
  { key: 'bill_payment_score', label: '💳 Pagamento de Contas', desc: 'Percentual de contas pagas no prazo' },
  { key: 'spending_control_score', label: '📋 Controle de Gastos', desc: 'Estabilidade e previsibilidade dos gastos' },
];

export default function HealthPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const latest = data?.latest || { total_score: null, grade: null };
  const history = data?.history || [];

  useEffect(() => { loadHealth(); }, []);

  const loadHealth = async () => {
    try { const result = await api.getHealthScore(); setData(result); setError(null); } catch (error) { setError(error); }
  };

  const recalculate = async () => {
    setLoading(true); setError(null);
    try { await api.calculateHealth(); await loadHealth(); } catch (error) { console.error(error); } finally { setLoading(false); }
  };

  const gradeColor = (score) => score == null ? 'var(--text-muted)' : score >= 80 ? 'var(--color-success)' : score >= 40 ? 'var(--color-warning)' : 'var(--color-danger)';
  const gradeLabel = latest.total_score == null ? 'Dados insuficientes' : latest.total_score >= 80 ? 'Excelente' : latest.total_score >= 60 ? 'Bom' : latest.total_score >= 40 ? 'Regular' : latest.total_score >= 20 ? 'Preocupante' : 'Crítico';

  if (error) return <DataError error={error} onRetry={loadHealth} />;
  if (!data) return <p role="status">Carregando diagnóstico…</p>;
  return (
    <div>
      <div className="page-header"><h1>Diagnóstico Financeiro</h1><p>Indicadores calculados sobre os dados disponíveis e conferidos</p></div>

      <section className="card" aria-label="Cobertura do diagnóstico"><strong>{data.coverage?.complete ? 'Período conferido' : 'Dados parciais'}</strong><p>Período: {data.period?.startDate || latest.period?.startDate || 'não informado'} a {data.period?.endDate || latest.period?.endDate || 'não informado'}.</p><p>{data.coverage?.verifiedMonthCount ?? '—'} meses com fechamento conciliado · {data.coverage?.pendingTransactions ?? '—'} movimentos pendentes.</p>{(data.quality?.warnings || []).map((warning, i) => <p key={i}>{typeof warning === 'string' ? warning : warning.message || warning.code}</p>)}</section>
      {/* Score Gauge */}
      <div className="card" style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <div className="health-gauge">
          <div className="gauge-score" style={{ color: gradeColor(latest.total_score) }}>{latest.total_score ?? 'Não calculado'}</div>
          <div className="gauge-grade" style={{ color: gradeColor(latest.total_score) }}>{latest.grade || 'Sem nota'} — {gradeLabel}</div>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', maxWidth: 500 }}>
            {latest.total_score == null ? 'Confira a cobertura e as pendências antes de interpretar indicadores.' : latest.total_score >= 60 ? 'Sua saúde financeira está em bom caminho! Continue assim.' : 'Sua saúde financeira precisa de cuidados urgentes. Implemente as mudanças sugeridas.'}
          </p>
          <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={recalculate} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-pulse' : ''} /> {loading ? 'Calculando...' : 'Recalcular Score'}
          </button>
        </div>
      </div>

      {/* Category Cards */}
      <div className="grid grid-3" style={{ marginBottom: '1.5rem' }}>
        {CATEGORIES.map(cat => {
          const score = latest[cat.key];
          return (
            <div key={cat.key} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{cat.label}</span>
                <span style={{ fontWeight: 700, color: gradeColor(score) }}>{score == null ? 'Não disponível' : score}</span>
              </div>
              <div style={{ height: 6, background: 'var(--bg-secondary)', borderRadius: 3, marginBottom: '0.5rem' }}>
                <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, score ?? 0))}%`, background: gradeColor(score), borderRadius: 3, transition: 'width 0.5s ease' }} />
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{cat.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Score Evolution */}
      <div className="card">
        <div className="card-header"><h3 className="card-title">Evolução do Score</h3></div>
        <div style={{ height: 200, marginTop: '0.5rem' }}>
          <Chart
            options={{
              chart: { type: 'line', toolbar: { show: false }, background: 'transparent', fontFamily: 'inherit' },
              theme: { mode: 'dark' },
              colors: ['var(--accent-gold)'],
              stroke: { curve: 'straight', width: 2 },
              dataLabels: { enabled: false },
              markers: { size: 4, colors: ['var(--accent-gold)'] },
              xaxis: { categories: history.map(h => new Date(h.calculated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })), labels: { style: { colors: '#94a3b8' } }, axisBorder: { show: false }, axisTicks: { show: false } },
              yaxis: {
                min: (history.length > 0 && Math.max(...history.map(h => Number(h.total_score || 0))) === Math.min(...history.map(h => Number(h.total_score || 0)))) ? 0 : 0,
                max: (history.length > 0 && Math.max(...history.map(h => Number(h.total_score || 0))) === Math.min(...history.map(h => Number(h.total_score || 0)))) ? 100 : 100,
                labels: { style: { colors: '#94a3b8' } }
              },
              grid: { borderColor: '#334155', strokeDashArray: 4 },
              tooltip: { theme: 'dark' },
            }}
            series={[{ name: 'Score', data: history.map(h => h.total_score) }]}
            type="line"
            height="100%"
          />
        </div>
      </div>
    </div>
  );
}

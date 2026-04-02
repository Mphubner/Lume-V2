import { useState, useEffect } from 'react';
import api from '../../services/api';
import { formatCurrency } from '../../utils/format';
import { Shield, Plus, Edit3, Minus, TrendingUp } from 'lucide-react';
import Chart from 'react-apexcharts';

export default function ReservePage() {
  const [reserve, setReserve] = useState({ current_amount: 0, target_amount: 0, monthly_income: 0 });
  const [loading, setLoading] = useState(false);
  const [showTarget, setShowTarget] = useState(false);
  const [targetForm, setTargetForm] = useState({ target_amount: '', monthly_income: '' });
  const [action, setAction] = useState(null); // 'add' | 'remove'
  const [amount, setAmount] = useState('');
  const [history, setHistory] = useState([]);

  useEffect(() => {
    loadReserve();
  }, []);

  const loadReserve = async () => {
    setLoading(true);
    try {
      const result = await api.getReserve();
      if (result) setReserve(result);
    } catch (err) { console.error('Error loading reserve', err); }
    setLoading(false);
  };

  const progressPct = reserve.target_amount > 0 ? Math.min(100, (reserve.current_amount / reserve.target_amount) * 100) : 0;
  const monthsOfSafety = reserve.monthly_income > 0 ? (reserve.current_amount / reserve.monthly_income) : 0;
  const remaining = Math.max(0, reserve.target_amount - reserve.current_amount);
  const monthlyNeeded = remaining > 0 && reserve.monthly_income > 0 ? (remaining / 12).toFixed(2) : 0;

  const safetyLabel = monthsOfSafety >= 6 ? '🟢 Excelente' : monthsOfSafety >= 3 ? '🟡 Bom' : monthsOfSafety >= 1 ? '🟠 Iniciando' : '🔴 Sem reserva';
  const safetyColor = monthsOfSafety >= 6 ? 'var(--color-success)' : monthsOfSafety >= 3 ? 'var(--color-warning)' : 'var(--color-danger)';

  const handleContribute = async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) return;
    const newAmount = action === 'add' ? reserve.current_amount + val : Math.max(0, reserve.current_amount - val);
    
    try {
      setLoading(true);
      const updated = await api.updateReserve({ ...reserve, current_amount: newAmount });
      setReserve(updated);
      setAction(null);
      setAmount('');
    } catch (err) { alert('Erro ao registrar valor: ' + err.message); }
    finally { setLoading(false); }
  };

  const handleSetTarget = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const updated = await api.updateReserve({
        ...reserve,
        target_amount: parseFloat(targetForm.target_amount) || reserve.target_amount,
        monthly_income: parseFloat(targetForm.monthly_income) || reserve.monthly_income,
      });
      setReserve(updated);
      setShowTarget(false);
    } catch (err) { alert('Erro ao salvar meta: ' + err.message); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Reserva de Emergência</h1>
          <p>Seu fundo de emergência para imprevistos — a base da saúde financeira</p>
        </div>
        <button className="btn btn-secondary" onClick={() => { setShowTarget(true); setTargetForm({ target_amount: String(reserve.target_amount), monthly_income: String(reserve.monthly_income) }); }}>
          <Edit3 size={16} /> Definir Meta
        </button>
      </div>

      {/* Main Progress Card */}
      <div className="card" style={{ maxWidth: 700, margin: '0 auto 1.5rem', padding: '2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🛡️</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--accent-gold)', lineHeight: 1 }}>{formatCurrency(reserve.current_amount)}</div>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>de {formatCurrency(reserve.target_amount)}</div>
        </div>

        {/* Progress Bar */}
        <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
          <div style={{ height: 16, background: 'var(--bg-secondary)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progressPct}%`, background: 'linear-gradient(90deg, var(--accent-gold), var(--color-success))', borderRadius: 8, transition: 'width 0.6s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>0%</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-gold)' }}>{progressPct.toFixed(1)}%</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>100%</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginBottom: '1.5rem' }}>
          {action ? (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input type="number" step="0.01" placeholder="R$ 0,00" value={amount} onChange={e => setAmount(e.target.value)} style={{ width: 150 }} />
              <button className="btn btn-primary btn-sm" onClick={handleContribute}>{action === 'add' ? 'Depositar' : 'Retirar'}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setAction(null); setAmount(''); }}>✕</button>
            </div>
          ) : (
            <>
              <button className="btn btn-primary" onClick={() => setAction('add')}><Plus size={16} /> Depositar</button>
              <button className="btn btn-secondary" onClick={() => setAction('remove')}><Minus size={16} /> Retirar</button>
            </>
          )}
        </div>

        {/* Safety Metrics */}
        <div className="grid grid-3">
          <div style={{ textAlign: 'center', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: 12 }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Meses de Segurança</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: safetyColor }}>{monthsOfSafety.toFixed(1)}</div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: safetyColor }}>{safetyLabel}</div>
          </div>
          <div style={{ textAlign: 'center', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: 12 }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Falta para a Meta</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>{formatCurrency(remaining)}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{remaining > 0 ? 'continue guardando!' : '🎉 Meta atingida!'}</div>
          </div>
          <div style={{ textAlign: 'center', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: 12 }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Guardar p/ Mês</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-gold)' }}>{formatCurrency(monthlyNeeded)}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>para atingir em 12 meses</div>
          </div>
        </div>
      </div>

      {/* Evolution Chart */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title"><TrendingUp size={18} style={{ color: 'var(--color-success)' }} /> Evolução da Reserva</h3>
        </div>
        <div style={{ height: 220, marginTop: '0.5rem' }}>
          <Chart
            options={{
              chart: { type: 'area', toolbar: { show: false }, background: 'transparent', fontFamily: 'inherit' },
              theme: { mode: 'dark' },
              colors: ['#d4a843'],
              stroke: { curve: history.length >= 2 ? 'smooth' : 'straight', width: 2 },
              dataLabels: { enabled: false },
              fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 90, 100] } },
              xaxis: { categories: history.map(h => h.month), labels: { style: { colors: '#94a3b8' } }, axisBorder: { show: false }, axisTicks: { show: false } },
              yaxis: { 
                labels: { formatter: val => typeof val === 'number' ? formatCurrency(val, true) : val, style: { colors: '#94a3b8' } },
                ...(history.length > 0 && Math.max(...history.map(h => Number(h.amount || 0))) === Math.min(...history.map(h => Number(h.amount || 0))) ? { min: Math.min(...history.map(h => Number(h.amount || 0))) - 1000, max: Math.max(...history.map(h => Number(h.amount || 0))) + 1000 } : {})
              },
              grid: { borderColor: '#334155', strokeDashArray: 4 },
              tooltip: { theme: 'dark', y: { formatter: v => formatCurrency(v) } },
            }}
            series={[{ name: 'Reserva', data: history.map(h => h.amount) }]}
            type="area"
            height="100%"
          />
        </div>
      </div>

      {/* Tips */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3 className="card-title" style={{ marginBottom: '1rem' }}>💡 Dicas para a Reserva</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {[
            { text: 'O ideal é ter entre 6 a 12 meses de gastos guardados', icon: '🎯' },
            { text: 'Separe a reserva em uma conta diferente da conta do dia-a-dia', icon: '🏦' },
            { text: 'Mantenha em investimentos de alta liquidez (Tesouro Selic, CDB)', icon: '📈' },
            { text: 'Não use a reserva para gastos planejados — crie uma meta separada', icon: '⚠️' },
          ].map((tip, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: 'var(--bg-secondary)', borderRadius: 'var(--border-radius-sm)' }}>
              <span style={{ fontSize: '1.25rem' }}>{tip.icon}</span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{tip.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Set Target Modal */}
      {showTarget && (
        <div className="modal-overlay" onClick={() => setShowTarget(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2>🛡️ Definir Meta da Reserva</h2>
              <button onClick={() => setShowTarget(false)} style={{ background: 'transparent', color: 'var(--text-muted)', fontSize: '1.25rem' }}>✕</button>
            </div>
            <form onSubmit={handleSetTarget}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Meta da Reserva (R$)</label>
                  <input type="number" step="0.01" value={targetForm.target_amount} onChange={e => setTargetForm({ ...targetForm, target_amount: e.target.value })} placeholder="15000" />
                </div>
                <div className="form-group">
                  <label>Renda Mensal (R$) — para calcular "meses de segurança"</label>
                  <input type="number" step="0.01" value={targetForm.monthly_income} onChange={e => setTargetForm({ ...targetForm, monthly_income: e.target.value })} placeholder="5000" />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowTarget(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">💾 Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

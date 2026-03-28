import { useState } from 'react';
import { formatCurrency } from '../../utils/format';
import { Upload, Plus, PieChart as PieChartIcon, TrendingUp, Wallet } from 'lucide-react';

export default function InvestmentsPage() {
  const [activeTab, setActiveTab] = useState('portfolio');

  // Empty state — sem dados mock
  const EmptyPanel = ({ icon, title, desc }) => (
    <div className="card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>{icon}</div>
      <h3 style={{ fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>{title}</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: 420, margin: '0 auto 1.5rem' }}>{desc}</p>
      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
        <button className="btn btn-primary"><Plus size={16} /> Adicionar Investimento</button>
        <button className="btn btn-secondary"><Upload size={16} /> Importar Carteira</button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1>Investimentos</h1>
          <p>Acompanhe sua carteira de investimentos com análise detalhada</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-primary"><Plus size={16} /> Adicionar</button>
          <button className="btn btn-secondary"><Upload size={16} /> Importar</button>
        </div>
      </div>

      {/* Resumo Cards — valores zerados até conectar dados */}
      <div className="grid grid-4" style={{ marginBottom: '1.5rem' }}>
        <div className="card" style={{ padding: '1.25rem', borderTop: '3px solid var(--color-info)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Total Investido</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{formatCurrency(0)}</div>
        </div>
        <div className="card" style={{ padding: '1.25rem', borderTop: '3px solid var(--color-success)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Rendimento Mensal</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{formatCurrency(0)}</div>
        </div>
        <div className="card" style={{ padding: '1.25rem', borderTop: '3px solid var(--text-secondary)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Classes de Ativos</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>0</div>
        </div>
        <div className="card" style={{ padding: '1.25rem', borderTop: '3px solid var(--accent-gold)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Total de Ativos</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>0</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ width: 'fit-content', marginBottom: '1.5rem' }}>
        {[
          { key: 'portfolio', label: '📊 Carteira' },
          { key: 'earnings', label: '💰 Rendimentos' },
          { key: 'allocation', label: '🎯 Alocação' },
        ].map(t => (
          <button key={t.key} className={`tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {activeTab === 'portfolio' && (
        <EmptyPanel
          icon="📊"
          title="Nenhum investimento cadastrado"
          desc="Adicione seus investimentos manualmente ou importe a carteira via extrato para visualizar a composição detalhada do seu portfólio."
        />
      )}

      {activeTab === 'earnings' && (
        <EmptyPanel
          icon="💰"
          title="Sem rendimentos registrados"
          desc="Quando seus investimentos estiverem cadastrados, os rendimentos mensais serão calculados e exibidos automaticamente aqui."
        />
      )}

      {activeTab === 'allocation' && (
        <EmptyPanel
          icon="🎯"
          title="Sem dados de alocação"
          desc="A alocação por classe de ativo será gerada automaticamente com base nos investimentos que você cadastrar na carteira."
        />
      )}
    </div>
  );
}

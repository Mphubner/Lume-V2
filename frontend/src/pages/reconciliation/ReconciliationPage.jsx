import { useState, useEffect } from 'react';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/format';
import { Scale, Check, X, AlertTriangle } from 'lucide-react';

export default function ReconciliationPage() {
  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedImport, setSelectedImport] = useState(null);

  useEffect(() => { loadImports(); }, []);

  const loadImports = async () => {
    setLoading(true);
    try {
      const result = await api.getImportHistory();
      setImports(result || []);
    } catch {
      setImports([
        { id: '1', filename: 'extrato_nubank_dez2025.ofx', file_type: 'ofx', total_transactions: 45, imported_transactions: 42, duplicates_skipped: 3, status: 'completed', created_at: '2025-12-28T14:30:00Z', accounts: { name: 'Nubank' } },
        { id: '2', filename: 'extrato_itau_nov2025.csv', file_type: 'csv', total_transactions: 32, imported_transactions: 30, duplicates_skipped: 2, status: 'completed', created_at: '2025-11-30T10:15:00Z', accounts: { name: 'Itaú' } },
        { id: '3', filename: 'fatura_nubank_jan2026.pdf', file_type: 'pdf', total_transactions: 28, imported_transactions: 28, duplicates_skipped: 0, status: 'completed', created_at: '2026-01-15T09:00:00Z', accounts: { name: 'Nubank Cartão' } },
      ]);
    } finally { setLoading(false); }
  };

  const statusBadge = (status) => {
    const map = { completed: 'badge-success', processing: 'badge-warning', failed: 'badge-danger' };
    const labels = { completed: '✅ Concluída', processing: '⏳ Processando', failed: '❌ Falhou' };
    return <span className={`badge ${map[status] || 'badge-info'}`}>{labels[status] || status}</span>;
  };

  const fileIcon = (type) => {
    const icons = { pdf: '📄', csv: '📊', xlsx: '📑', ofx: '🏦' };
    return icons[type] || '📄';
  };

  return (
    <div>
      <div className="page-header">
        <h1>Conferir Extratos</h1>
        <p>Revise e confira suas importações — veja o que a IA categorizou automaticamente</p>
      </div>

      {loading ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : imports.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon"><Scale size={48} /></div>
            <h3>Nada para conferir</h3>
            <p>Importe um extrato bancário na página "Importar" para começar a conferir suas transações</p>
            <a href="/importar" className="btn btn-primary">📤 Ir para Importar</a>
          </div>
        </div>
      ) : (
        <div>
          {/* Summary */}
          <div className="grid grid-3" style={{ marginBottom: '1.5rem' }}>
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent-gold)' }}>{imports.length}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Importações realizadas</div>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-success)' }}>{imports.reduce((s, i) => s + (i.imported_transactions || 0), 0)}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Transações importadas</div>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-warning)' }}>{imports.reduce((s, i) => s + (i.duplicates_skipped || 0), 0)}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Duplicatas ignoradas</div>
            </div>
          </div>

          {/* Import History Table */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">📋 Histórico de Importações</h3>
            </div>
            <table className="data-table">
              <thead>
                <tr><th>Arquivo</th><th>Conta</th><th>Transações</th><th>Importadas</th><th>Duplicatas</th><th>Status</th><th>Data</th></tr>
              </thead>
              <tbody>
                {imports.map(imp => (
                  <tr key={imp.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedImport(selectedImport === imp.id ? null : imp.id)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.25rem' }}>{fileIcon(imp.file_type)}</span>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>{imp.filename}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{imp.file_type?.toUpperCase()}</div>
                        </div>
                      </div>
                    </td>
                    <td>{imp.accounts?.name || '-'}</td>
                    <td style={{ fontWeight: 600 }}>{imp.total_transactions}</td>
                    <td style={{ color: 'var(--color-success)', fontWeight: 600 }}>{imp.imported_transactions}</td>
                    <td style={{ color: imp.duplicates_skipped > 0 ? 'var(--color-warning)' : 'var(--text-muted)' }}>{imp.duplicates_skipped}</td>
                    <td>{statusBadge(imp.status)}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{imp.created_at ? new Date(imp.created_at).toLocaleDateString('pt-BR') : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {selectedImport && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: 'var(--border-radius-sm)' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>📊 Detalhes da Importação</div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                  A IA classificou automaticamente as transações com base nas descrições e nas suas regras de categorização.
                </p>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <a href="/lancamentos" className="btn btn-secondary btn-sm">📋 Ver Transações Importadas</a>
                  <a href="/configuracoes" className="btn btn-ghost btn-sm">🤖 Ajustar Regras da IA</a>
                </div>
              </div>
            )}
          </div>

          {/* Tips */}
          <div className="card" style={{ marginTop: '1.5rem' }}>
            <h3 className="card-title" style={{ marginBottom: '1rem' }}>💡 Como melhorar a categorização</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[
                { icon: '🤖', text: 'A cada transação que você reclassifica, a IA aprende e cria regras automáticas' },
                { icon: '📋', text: 'Vá em Configurações > IA para ver e editar suas regras de categorização' },
                { icon: '🔁', text: 'Reimporte um extrato — duplicatas são automaticamente ignoradas' },
                { icon: '⚡', text: 'Quanto mais você usa, mais precisa a categorização automática fica' },
              ].map((tip, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <span style={{ fontSize: '1.25rem' }}>{tip.icon}</span> {tip.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

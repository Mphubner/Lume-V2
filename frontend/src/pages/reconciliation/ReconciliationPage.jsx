import { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/format';
import { Check, X, ChevronDown, AlertTriangle, Zap, CheckCircle2, RefreshCw, ArrowRight, Trash2, Edit2 } from 'lucide-react';

const CONFIDENCE_LABEL = (c) => {
  if (c === null || c === undefined) return { label: 'Sem IA', color: 'var(--text-muted)', icon: '🔵' };
  if (c >= 0.8) return { label: 'Alta confiança', color: 'var(--color-success)', icon: '🟢' };
  if (c >= 0.5) return { label: 'Média confiança', color: 'var(--color-warning)', icon: '🟡' };
  return { label: 'Baixa confiança', color: 'var(--color-danger)', icon: '🔴' };
};

export default function ReconciliationPage() {
  const [pending, setPending] = useState([]);
  const [imports, setImports] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState({}); // {id: true}
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ description: '', amount: 0, category_id: '' });
  const [activeTab, setActiveTab] = useState('pending');
  const [filter, setFilter] = useState('all'); // all | low | medium | high

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pendingRes, historyRes, catsRes] = await Promise.all([
        api.getPendingReconciliation(),
        api.getImportHistory(),
        api.getCategories(),
      ]);
      setPending(pendingRes.transactions || []);
      setImports(historyRes || []);
      setCategories(catsRes || []);
    } catch {
      setPending([]);
      setImports([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Approve a single transaction ──────────────────────────────────────────
  const approve = async (id) => {
    setProcessing(p => ({ ...p, [id]: true }));
    try {
      await api.reconcileTransaction(id, { approved: true });
      setPending(prev => prev.filter(t => t.id !== id));
    } catch (err) { alert(`Erro: ${err.message}`); }
    finally { setProcessing(p => ({ ...p, [id]: false })); }
  };

  // ── Save full correction (description, amount, category) and approve ──────
  const saveCorrection = async (id) => {
    setProcessing(p => ({ ...p, [id]: true }));
    try {
      // First update description + amount via transactions PUT
      const updateData = {};
      const original = pending.find(t => t.id === id);
      if (editForm.description && editForm.description !== original?.description) updateData.description = editForm.description;
      if (editForm.amount !== undefined && editForm.amount !== original?.amount) updateData.amount = editForm.amount;
      if (editForm.category_id) updateData.category_id = editForm.category_id;
      
      if (Object.keys(updateData).length > 0 && !updateData.category_id) {
        // Only non-category fields changed — update via PUT then approve
        await api.updateTransaction(id, updateData);
        await api.reconcileTransaction(id, { approved: true });
      } else {
        // Category changed (or everything) — reconcile handles type sync
        await api.reconcileTransaction(id, { ...updateData, approved: true });
      }
      
      setPending(prev => prev.filter(t => t.id !== id));
      setEditingId(null);
    } catch (err) { alert(`Erro: ${err.message}`); }
    finally { setProcessing(p => ({ ...p, [id]: false })); }
  };

  // ── Delete a transaction ──────────────────────────────────────────────────
  const deleteTransaction = async (id) => {
    if (!confirm('Tem certeza que deseja excluir esta transação?')) return;
    setProcessing(p => ({ ...p, [id]: true }));
    try {
      await api.deleteTransaction(id);
      setPending(prev => prev.filter(t => t.id !== id));
    } catch (err) { alert(`Erro ao excluir: ${err.message}`); }
    finally { setProcessing(p => ({ ...p, [id]: false })); }
  };

  // ── Start editing a transaction ───────────────────────────────────────────
  const startEditing = (tx) => {
    setEditingId(tx.id);
    setEditForm({
      description: tx.description || '',
      amount: parseFloat(tx.amount) || 0,
      category_id: tx.category_id || '',
    });
  };

  // ── Approve all at once ───────────────────────────────────────────────────
  const approveAll = async () => {
    setLoading(true);
    try {
      await api.reconcileAll();
      load(); // Reload to refresh both pending and history stats
    } catch (err) { alert(`Erro ao aprovar: ${err.message}`); }
    finally { setLoading(false); }
  };

  // ── Computed ──────────────────────────────────────────────────────────────
  const filtered = pending.filter(t => {
    const c = t.ai_confidence;
    if (filter === 'low') return c !== null && c < 0.5;
    if (filter === 'medium') return c !== null && c >= 0.5 && c < 0.8;
    if (filter === 'high') return c === null || c >= 0.8;
    return true;
  });

  const lowCount = pending.filter(t => t.ai_confidence !== null && t.ai_confidence < 0.5).length;
  const totalAmount = filtered.reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Conferir Extratos</h1>
          <p>Revise o que a IA categorizou — corrija e aprove para confirmar no seu histórico</p>
        </div>
        {pending.length > 0 && (
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={load}>
              <RefreshCw size={14} /> Atualizar
            </button>
            <button className="btn btn-primary" onClick={approveAll}>
              <CheckCircle2 size={16} /> Aprovar Tudo ({pending.length})
            </button>
          </div>
        )}
      </div>

      {/* TABS */}
      <div className="tabs" style={{ width: 'fit-content', marginBottom: '1.5rem' }}>
        <button className={`tab ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>
          ✅ Aguardando Revisão {pending.length > 0 && <span className="badge badge-danger" style={{ marginLeft: 4 }}>{pending.length}</span>}
        </button>
        <button className={`tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
          📋 Histórico de Importações
        </button>
      </div>

      {loading ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : activeTab === 'pending' ? (
        /* ─── PENDING REVIEW TAB ─────────────────────────────────────────── */
        pending.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon"><CheckCircle2 size={48} style={{ color: 'var(--color-success)' }} /></div>
              <h3>Tudo em dia! 🎉</h3>
              <p>Não há transações aguardando revisão. Importe um extrato para começar.</p>
              <a href="/importar" className="btn btn-primary">📤 Importar Extrato</a>
            </div>
          </div>
        ) : (
          <>
            {/* Stats row */}
            <div className="grid grid-3" style={{ marginBottom: '1.5rem' }}>
              <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent-gold)' }}>{pending.length}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Transações para revisar</div>
              </div>
              <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-danger)' }}>{lowCount}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>IA incerta (baixa confiança)</div>
              </div>
              <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-success)' }}>{formatCurrency(totalAmount)}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Volume total filtrado</div>
              </div>
            </div>

            {/* Filter chips */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              {[
                { key: 'all', label: `Todas (${pending.length})` },
                { key: 'low', label: `🔴 Baixa confiança (${lowCount})` },
                { key: 'medium', label: `🟡 Média` },
                { key: 'high', label: `🟢 Alta` },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`btn ${filter === f.key ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {filtered.map(tx => {
                const conf = CONFIDENCE_LABEL(tx.ai_confidence);
                const isEditing = editingId === tx.id;
                const busy = processing[tx.id];

                return (
                  <div
                    key={tx.id}
                    className="card"
                    style={{
                      padding: '1rem 1.25rem',
                      borderLeft: `4px solid ${conf.color}`,
                      opacity: busy ? 0.5 : 1,
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {/* Header row: description, amount, confidence, quick actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                      {/* Date + Description */}
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.2rem' }}>{tx.description}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {formatDate(tx.date)} · {tx.accounts?.name || 'Conta desconhecida'}
                        </div>
                      </div>

                      {/* Category Badge */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', padding: '0 0.5rem', minWidth: 140 }}>
                        <span className="badge" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                          {tx.categories?.icon} {tx.categories?.name || 'Sem categoria'}
                        </span>
                        {tx.subcategory && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                            <span style={{ opacity: 0.5, marginRight: '4px' }}>↳</span> {tx.subcategory}
                          </span>
                        )}
                      </div>

                      {/* Amount */}
                      <div style={{ fontWeight: 700, fontSize: '1rem', color: tx.amount >= 0 ? 'var(--color-success)' : 'var(--color-danger)', minWidth: 90, textAlign: 'right' }}>
                        {tx.amount >= 0 ? '+' : '-'}{formatCurrency(Math.abs(tx.amount))}
                      </div>

                      {/* Category badge (click to open edit) */}
                      {!isEditing && (
                        <button
                          onClick={() => startEditing(tx)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                            padding: '0.35rem 0.7rem', borderRadius: 'var(--border-radius-full)',
                            background: 'var(--bg-secondary)', border: `1px solid ${tx.categories?.color || 'var(--border-color)'}`,
                            cursor: 'pointer', fontSize: '0.82rem', fontWeight: 500,
                          }}
                          title="Clique para editar esta transação"
                        >
                          {tx.categories?.icon || '📦'} {tx.categories?.name || 'Sem categoria'}
                          <ChevronDown size={12} style={{ opacity: 0.5 }} />
                        </button>
                      )}

                      {/* Confidence badge */}
                      <div style={{ fontSize: '0.72rem', color: conf.color, fontWeight: 600, minWidth: 100, textAlign: 'center' }}>
                        {conf.icon} {conf.label}
                        {tx.ai_confidence !== null && tx.ai_confidence !== undefined && (
                          <span style={{ opacity: 0.6, marginLeft: 4 }}>({Math.round(tx.ai_confidence * 100)}%)</span>
                        )}
                      </div>

                      {/* Actions */}
                      {!isEditing && (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => approve(tx.id)}
                            disabled={busy}
                            title="Aprovar categoria sugerida pela IA"
                          >
                            <Check size={14} /> Aprovar
                          </button>
                          <button
                            onClick={() => startEditing(tx)}
                            disabled={busy}
                            title="Editar transação"
                            style={{ background: 'none', border: '1px solid var(--border-color)', color: 'var(--text-muted)', padding: '0.3rem 0.5rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => deleteTransaction(tx.id)}
                            disabled={busy}
                            title="Excluir transação"
                            style={{ background: 'none', border: '1px solid var(--color-danger)', color: 'var(--color-danger)', padding: '0.3rem 0.5rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: 0.7 }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Expanded Edit Form */}
                    {isEditing && (
                      <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--bg-secondary)', borderRadius: '8px', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
                        <div style={{ flex: '2 1 200px' }}>
                          <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Descrição</label>
                          <input
                            type="text"
                            value={editForm.description}
                            onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                            style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.85rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--form-bg)', color: 'var(--text-primary)' }}
                          />
                        </div>
                        <div style={{ flex: '0 1 120px' }}>
                          <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Valor (R$)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={editForm.amount}
                            onChange={e => setEditForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                            style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.85rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--form-bg)', color: 'var(--text-primary)' }}
                          />
                        </div>
                        <div style={{ flex: '1 1 180px' }}>
                          <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Categoria</label>
                          <select
                            value={editForm.category_id}
                            onChange={e => setEditForm(f => ({ ...f, category_id: e.target.value, subcategory: '' }))}
                            style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.85rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                          >
                            <option value="" style={{ color: 'var(--text-muted)', background: 'var(--bg-card)' }}>Selecione...</option>
                            {categories.map(c => (
                              <option key={c.id} value={c.id} style={{ color: 'var(--text-primary)', background: 'var(--bg-card)' }}>{c.icon} {c.name}</option>
                            ))}
                          </select>
                        </div>
                        <div style={{ flex: '1 1 150px' }}>
                          <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.2rem' }}>Subcategoria</label>
                          <select
                            value={editForm.subcategory || ''}
                            onChange={e => setEditForm(f => ({ ...f, subcategory: e.target.value }))}
                            style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.85rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                            disabled={!editForm.category_id}
                          >
                            <option value="" style={{ color: 'var(--text-muted)', background: 'var(--bg-card)' }}>- Nenhuma -</option>
                            {categories.find(c => c.id === editForm.category_id)?.subcategories?.map(sub => (
                              <option key={sub} value={sub} style={{ color: 'var(--text-primary)', background: 'var(--bg-card)' }}>{sub}</option>
                            ))}
                          </select>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="btn btn-primary btn-sm" onClick={() => saveCorrection(tx.id)} disabled={busy}>
                            <Check size={14} /> Salvar e Aprovar
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>
                            <X size={14} /> Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Bottom CTA */}
            {filtered.length === 0 && filter !== 'all' && (
              <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
                <p style={{ color: 'var(--text-muted)' }}>Nenhuma transação com esse filtro de confiança.</p>
              </div>
            )}
          </>
        )
      ) : (
        /* ─── HISTORY TAB ────────────────────────────────────────────────── */
        imports.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <h3>Nenhuma importação ainda</h3>
              <a href="/importar" className="btn btn-primary">📤 Importar Extrato</a>
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">📋 Histórico de Importações</h3>
            </div>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 200 }}>Arquivo</th><th>Conta</th><th>Total</th><th>Importadas</th><th>Duplicatas</th><th>Status</th><th style={{ minWidth: 100 }}>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {imports.map(imp => (
                    <tr key={imp.id}>
                      <td>
                        <div style={{ fontWeight: 500, fontSize: '0.85rem', whiteSpace: 'normal', wordBreak: 'break-all' }}>{imp.filename}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{imp.file_type?.toUpperCase()}</div>
                      </td>
                      <td>{imp.accounts?.name || '-'}</td>
                      <td style={{ fontWeight: 600 }}>{imp.total_transactions}</td>
                      <td style={{ color: 'var(--color-success)', fontWeight: 600 }}>{imp.imported_transactions}</td>
                      <td style={{ color: imp.duplicates_skipped > 0 ? 'var(--color-warning)' : 'var(--text-muted)' }}>{imp.duplicates_skipped}</td>
                      <td>
                        <span className={`badge ${imp.status === 'completed' ? 'badge-success' : imp.status === 'processing' ? 'badge-warning' : 'badge-danger'}`}>
                          {imp.status === 'completed' ? '✅ Concluída' : imp.status === 'processing' ? '⏳ Processando' : '❌ Falhou'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {imp.created_at ? new Date(imp.created_at).toLocaleDateString('pt-BR') : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Tips */}
      {activeTab === 'pending' && pending.length > 0 && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h3 className="card-title" style={{ marginBottom: '0.75rem' }}>💡 Como funciona o aprendizado</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {[
              { icon: '🟢', text: 'Clique em "Aprovar" para confirmar a categoria que a IA sugeriu' },
              { icon: '✏️', text: 'Clique na badge de categoria para corrigi-la — a IA vai aprender para as próximas importações' },
              { icon: '⚡', text: '"Aprovar Tudo" confirma todas as transações com a categoria atual da IA' },
              { icon: '🔴', text: 'Transações com confiança baixa merecem maior atenção antes de aprovar' },
            ].map((tip, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.4rem 0.5rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                <span style={{ fontSize: '1.1rem' }}>{tip.icon}</span> {tip.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import api from '../../services/api';
import { X, Save, Trash2, Edit2, CheckCircle } from 'lucide-react';

export default function ImportAuditModal({ importId, onClose }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    if (importId) fetchTransactions();
  }, [importId]);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const res = await api.getTransactions({ import_id: importId });
      if (res.data) setTransactions(res.data);
      else setTransactions(res);
    } catch (e) {
      console.error(e);
      alert('Erro ao carregar transações deste lote.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Excluir este lançamento?')) return;
    try {
      await api.deleteTransaction(id);
      setTransactions(transactions.filter(t => t.id !== id));
    } catch (e) { alert('Erro ao excluir'); }
  };

  const handleEdit = (t) => {
    setEditingId(t.id);
    setEditForm({ description: t.description, amount: t.amount, category_id: t.category_id });
  };

  const handleSaveEdit = async (id) => {
    try {
      await api.updateTransaction(id, editForm);
      setTransactions(transactions.map(t => t.id === id ? { ...t, ...editForm } : t));
      setEditingId(null);
    } catch (e) { alert('Erro ao salvar'); }
  };

  if (!importId) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: '1rem'
    }}>
      <div className="card" style={{
        width: '100%', maxWidth: '800px', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', background: 'var(--bg-base)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Auditoria da Importação</h2>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Confira, edite ou exclua o que a IA Lume identificou</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}><X size={24} /></button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, paddingRight: '0.5rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Carregando lançamentos...</div>
          ) : transactions.length === 0 ? (
             <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Nenhuma transação encontrada (talvez foram excluídas ou duplicadas ignoradas).</div>
          ) : (
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Data</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Descrição</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Valor</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(t => (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.75rem 0.5rem' }}>{new Date(t.date).toLocaleDateString('pt-BR')}</td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      {editingId === t.id ? (
                        <input value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} style={{ width: '100%', padding: '0.25rem' }} />
                      ) : t.description}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', color: t.amount >= 0 ? 'var(--color-success)' : 'var(--text-primary)' }}>
                      {editingId === t.id ? (
                        <input type="number" step="0.01" value={editForm.amount} onChange={e => setEditForm({...editForm, amount: parseFloat(e.target.value)})} style={{ width: '80px', padding: '0.25rem' }} />
                      ) : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.amount)}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                      {editingId === t.id ? (
                        <>
                          <button onClick={() => handleSaveEdit(t.id)} style={{ background: 'none', border: 'none', color: 'var(--color-success)', cursor: 'pointer', marginRight: '0.5rem' }}><CheckCircle size={18} /></button>
                          <button onClick={() => setEditingId(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => handleEdit(t)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginRight: '0.5rem' }}><Edit2 size={16} /></button>
                          <button onClick={() => handleDelete(t.id)} style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer' }}><Trash2 size={16} /></button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

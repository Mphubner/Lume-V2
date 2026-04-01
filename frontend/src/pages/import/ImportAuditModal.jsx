import { useState, useEffect } from 'react';
import api from '../../services/api';
import { X, Save, Trash2, Edit2, CheckCircle } from 'lucide-react';

export default function ImportAuditModal({ importId, onClose }) {
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    if (importId) {
      fetchTransactions();
      api.getCategories().then(data => setCategories(data)).catch(console.error);
    }
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

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };
  
  const toggleSelectAll = () => {
    if (selectedIds.length === transactions.length) setSelectedIds([]);
    else setSelectedIds(transactions.map(t => t.id));
  };

  const handleBulkAction = async (actionType, value = null) => {
    if (!selectedIds.length) return;
    try {
      if (actionType === 'delete') {
        if (!window.confirm(`Excluir ${selectedIds.length} transações permanentemente?`)) return;
        setLoading(true);
        await Promise.all(selectedIds.map(id => api.deleteTransaction(id)));
        setTransactions(transactions.filter(t => !selectedIds.includes(t.id)));
        setSelectedIds([]);
      } else if (actionType === 'approve') {
        if (!window.confirm(`Concluir importação das ${selectedIds.length} transações selecionadas para seus Lançamentos?`)) return;
        setLoading(true);
        // Aprova as enviando request de atualização local, removendo do escopo do modal (onde status_reconciled=false)
        await Promise.all(selectedIds.map(id => api.updateTransaction(id, { is_reconciled: true })));
        setTransactions(transactions.filter(t => !selectedIds.includes(t.id)));
        setSelectedIds([]);
      } else if (actionType === 'category') {
        setLoading(true);
        await Promise.all(selectedIds.map(id => api.updateTransaction(id, { category_id: value })));
        setTransactions(transactions.map(t => selectedIds.includes(t.id) ? { ...t, category_id: value } : t));
      }
    } catch (e) {
      console.error(e);
      alert('Erro ao executar ação em lote');
    } finally {
      setLoading(false);
    }
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
          {selectedIds.length > 0 && (
            <div style={{ display:'flex', gap:'0.5rem', background:'var(--bg-card)', padding:'0.75rem', borderRadius:'8px', marginBottom:'1rem', alignItems:'center' }}>
              <span style={{fontWeight:'bold', marginRight:'1rem', color:'var(--text-primary)'}}>{selectedIds.length} selecionadas</span>
              
              <button 
                onClick={() => handleBulkAction('approve')} 
                style={{ background: 'var(--color-success)', color: '#fff', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize:'0.85rem' }}
              >
                <CheckCircle size={16} /> Aprovar Lote
              </button>

              <select 
                onChange={(e) => { if(e.target.value) { handleBulkAction('category', e.target.value); e.target.value = ''; } }} 
                style={{ fontSize:'0.85rem', padding:'0.4rem', border:'1px solid var(--border-color)', borderRadius:'4px', background:'var(--form-bg)', color:'var(--text-primary)', outline:'none' }}
              >
                <option value="">Trocar Categoria de todas...</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>

              <button 
                onClick={() => handleBulkAction('delete')} 
                style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-danger)', border: '1px solid var(--color-danger)', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize:'0.85rem' }}
              >
                <Trash2 size={16} /> Excluir Lote
              </button>

              <button onClick={() => setSelectedIds([])} style={{marginLeft:'auto', background:'none', color:'var(--text-muted)', border:'none', cursor:'pointer', fontSize:'0.85rem'}}>Desmarcar tudo</button>
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Carregando lançamentos...</div>
          ) : transactions.length === 0 ? (
             <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Nenhuma transação encontrada (talvez foram excluídas ou duplicadas ignoradas).</div>
          ) : (
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.75rem 0.5rem', width: '40px' }}>
                    <input 
                      type="checkbox" 
                      style={{ cursor: 'pointer' }}
                      checked={selectedIds.length === transactions.length && transactions.length > 0} 
                      onChange={toggleSelectAll} 
                    />
                  </th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Data</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Descrição</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Valor</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(t => (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border-color)', background: selectedIds.includes(t.id) ? 'rgba(45, 126, 240, 0.05)' : 'transparent' }}>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <input 
                        type="checkbox" 
                        style={{ cursor: 'pointer' }}
                        checked={selectedIds.includes(t.id)} 
                        onChange={() => toggleSelect(t.id)} 
                      />
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-primary)' }}>{new Date(t.date).toLocaleDateString('pt-BR')}</td>
                    <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-primary)' }}>
                      {editingId === t.id ? (
                        <input value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} style={{ width: '100%', padding: '0.25rem' }} />
                      ) : (
                        <div>
                          <span>{t.description}</span>
                          {t.categories && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{t.categories.icon} {t.categories.name}</div>}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 0.5rem', color: t.amount >= 0 ? 'var(--color-success)' : 'var(--text-primary)', fontWeight: '500' }}>
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

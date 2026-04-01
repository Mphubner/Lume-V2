import { useState } from 'react';
import api from '../../services/api';

export default function InlineCategorySelect({ 
  value, 
  onChange, 
  categories = [], 
  typeFilter = 'expense', 
  onCategoryCreated 
}) {
  const [isCreating, setIsCreating] = useState(false);
  const [newCat, setNewCat] = useState({ name: '', icon: '📦', color: '#6366f1', parent_id: '', nature: 'variable', group_name: '' });
  const [loading, setLoading] = useState(false);

  // Filter categories by type (show if type matches or if category is 'both')
  const filteredCategories = categories.filter(c => c.type === typeFilter || c.type === 'both');

  const handleSelectChange = (e) => {
    const val = e.target.value;
    if (val === 'CREATE_NEW') {
      setIsCreating(true);
      setNewCat({ ...newCat, name: '', nature: 'variable', group_name: '' }); 
    } else {
      onChange(val);
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        name: newCat.name,
        icon: newCat.icon,
        color: newCat.color,
        type: typeFilter, // automatically assign to current context
        nature: newCat.nature,
        parent_id: null,
        group_name: null
      };
      const created = await api.createCategory(payload);
      
      // Notify parent to fetch categories
      if (onCategoryCreated) {
        onCategoryCreated(created);
      }
      
      // Auto select the new category
      onChange(created.id);
      setIsCreating(false);
    } catch (err) {
      alert('Erro ao criar categoria: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Determine options structure
  const optionNodes = [];
  const groups = {
    expense: { label: 'Despesas', items: filteredCategories.filter(c => c.type === 'expense') },
    income: { label: 'Receitas', items: filteredCategories.filter(c => c.type === 'income') },
    both: { label: 'Ajustes', items: filteredCategories.filter(c => c.type === 'both') }
  };

  Object.values(groups).forEach(g => {
    if (g.items.length > 0) {
      optionNodes.push(
        <optgroup key={g.label} label={g.label}>
          {g.items.map(child => (
            <option key={child.id} value={child.id} style={{ color: 'var(--text-primary)', background: 'var(--bg-card)' }}>
              {child.icon} {child.name}
            </option>
          ))}
        </optgroup>
      );
    }
  });

  return (
    <>
      <select value={value || ''} onChange={handleSelectChange} style={{ background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }} required>
        <option value="" disabled style={{ color: 'var(--text-muted)' }}>Selecione uma categoria...</option>
        {optionNodes}
        {/* The inline create option */}
        <option value="CREATE_NEW">➕ Criar Nova Categoria...</option>
      </select>

      {/* Sub-modal for creating category */}
      {isCreating && (
        <div className="modal-overlay" onClick={() => !loading && setIsCreating(false)} style={{ zIndex: 1100 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3>✨ Nova Categoria</h3>
              <button 
                type="button" 
                onClick={() => setIsCreating(false)} 
                style={{ background: 'transparent', color: 'var(--text-muted)' }}
                disabled={loading}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <div className="form-group" style={{ flexShrink: 0, width: '4rem' }}>
                    <label>Ícone</label>
                    <input 
                      type="text" 
                      value={newCat.icon} 
                      onChange={e => setNewCat({ ...newCat, icon: e.target.value })} 
                      maxLength={2} 
                      required 
                      style={{ textAlign: 'center', fontSize: '1.25rem' }}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Nome da Categoria</label>
                    <input 
                      type="text" 
                      value={newCat.name} 
                      onChange={e => setNewCat({ ...newCat, name: e.target.value })} 
                      placeholder="Ex: Assinaturas" 
                      required 
                      autoFocus
                    />
                  </div>
                </div>


                
                <div className="form-group">
                  <label>Cor de Identificação</label>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {['#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'].map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewCat({ ...newCat, color })}
                        style={{
                          width: 24, height: 24, borderRadius: '50%', background: color, border: 'none', cursor: 'pointer',
                          boxShadow: newCat.color === color ? `0 0 0 2px var(--bg-card), 0 0 0 4px ${color}` : 'none',
                          transition: 'all 0.2s'
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsCreating(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

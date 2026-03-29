import { useState, useCallback, useEffect } from 'react';
import api from '../../services/api';
import { Upload as UploadIcon, FileText, CheckCircle, AlertTriangle, Building2, Loader2, RefreshCw } from 'lucide-react';
import PluggyWidget from '../../components/ui/PluggyWidget';
import ImportAuditModal from './ImportAuditModal';
import './ImportPage.css';

export default function ImportPage() {
  const [accountType, setAccountType] = useState('checking');
  const [accountName, setAccountName] = useState('');
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  const [history, setHistory] = useState([]);
  const [isPolling, setIsPolling] = useState(false);
  const [auditImportId, setAuditImportId] = useState(null);

  const fetchHistory = async () => {
    try {
      const res = await api.get('/import/history');
      setHistory(res);
      const hasProcessing = res.some(h => h.status === 'processing');
      setIsPolling(hasProcessing);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    let interval;
    if (isPolling) {
      interval = setInterval(fetchHistory, 4000);
    }
    return () => clearInterval(interval);
  }, [isPolling]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) setFile(droppedFile);
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      await api.uploadFile(file, accountName || null);
      setFile(null); // Limpa o estado e libera a UI
      fetchHistory(); // Chama o history para ver o novo estado processing
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'processing': return <span className="badge" style={{background: 'var(--accent-warning)', color: '#000', display: 'flex', gap: '4px', alignItems: 'center'}}><Loader2 size={12} className="animate-spin" /> Processando IA</span>;
      case 'completed': return <span className="badge" style={{background: 'var(--color-success)', color: '#fff', display: 'flex', gap: '4px', alignItems: 'center'}}><CheckCircle size={12} /> Concluído</span>;
      case 'failed': return <span className="badge" style={{background: 'var(--color-danger)', color: '#fff', display: 'flex', gap: '4px', alignItems: 'center'}}><AlertTriangle size={12} /> Falhou</span>;
      case 'empty': return <span className="badge" style={{background: 'var(--bg-card-hover)', color: 'var(--text-muted)'}}>Vazio</span>;
      default: return <span className="badge text-muted">{status}</span>;
    }
  };

  return (
    <div>
      {auditImportId && <ImportAuditModal importId={auditImportId} onClose={() => setAuditImportId(null)} />}
      <div className="page-header">
        <h1>Importação e Conexões</h1>
        <p>Conecte seus bancos ou faça upload inteligente de faturas com a IA Lume</p>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <PluggyWidget onConnectSuccess={(data) => fetchHistory()} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '2rem 0' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border-color)' }}></div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Ou Exporte Manualmente (IA)</div>
        <div style={{ flex: 1, height: 1, background: 'var(--border-color)' }}></div>
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
        
        {/* Lado Esquerdo: Upload */}
        <div>
          <div className="card" style={{ marginBottom: '1.5rem', background: 'var(--bg-card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--accent-purple-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ✨
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Upload Inteligente</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>A IA analisa e categoriza automaticamente</div>
              </div>
            </div>

            <div
              className={`upload-zone ${dragOver ? 'dragover' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-input').click()}
              style={{ padding: '2rem', border: '2px dashed var(--border-color)', borderRadius: '12px', textAlign: 'center', cursor: 'pointer', background: dragOver ? 'var(--bg-card-hover)' : 'transparent', transition: 'all 0.2s' }}
            >
              <input id="file-input" type="file" accept=".pdf,.csv,.xlsx,.ofx" style={{ display: 'none' }} onChange={e => setFile(e.target.files[0])} />
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📤</div>
              {file ? (
                <>
                  <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.25rem' }}>{file.name}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{(file.size / 1024).toFixed(1)} KB</div>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.25rem' }}>Arraste seus extratos aqui</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>ou clique para selecionar</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.5rem' }}>Suporta PDF, CSV, OFX</div>
                </>
              )}
            </div>

            {file && (
              <div style={{ marginTop: '1rem' }}>
                <button 
                  className="btn btn-primary" 
                  onClick={handleUpload} 
                  disabled={uploading} 
                  style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', borderRadius: '8px' }}
                >
                  {uploading ? '⏳ Enviando para Fila...' : 'Iniciar Importação Automática'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Lado Direito: Histórico da Fila */}
        <div className="card" style={{ background: 'var(--bg-card)', minHeight: '344px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>Histórico Lume AI</div>
            {isPolling && <RefreshCw size={16} className="text-muted animate-spin" />}
          </div>

          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Acompanhe a extração de seus últimos extratos enviados.
          </div>

          {history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: '12px' }}>
              <FileText size={32} style={{ opacity: 0.5, marginBottom: '0.5rem' }} />
              <div>Nenhuma importação no histórico ainda.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '400px', overflowY: 'auto', paddingRight: '0.5rem' }}>
              {history.map(item => (
                <div key={item.id} style={{ 
                  border: '1px solid',
                  borderColor: item.status === 'processing' ? 'var(--accent-gold)' : 'var(--border-color)', 
                  borderRadius: '12px', 
                  padding: '1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: item.status === 'processing' ? 'var(--accent-gold-dim)' : 'transparent',
                  transition: 'all 0.3s ease'
                }}>
                  <div style={{ flex: 1, minWidth: 0, paddingRight: '1rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.filename}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      {new Date(item.created_at).toLocaleString('pt-BR')} 
                      {item.total_transactions > 0 && ` • ${item.total_transactions} lançamentos`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                    {getStatusBadge(item.status)}
                    {item.status === 'completed' && item.total_transactions > 0 && (
                      <button 
                        className="btn btn-outline" 
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', borderRadius: '6px' }}
                        onClick={() => setAuditImportId(item.id)}
                      >
                         Ver Extração Lume
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useCallback } from 'react';
import api from '../../services/api';
import { Upload as UploadIcon, FileText, CheckCircle, AlertTriangle, Building2 } from 'lucide-react';
import PluggyWidget from '../../components/ui/PluggyWidget';

export default function ImportPage() {
  const [accountType, setAccountType] = useState('checking');
  const [accountName, setAccountName] = useState('');
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

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
      const response = await api.uploadFile(file, null);
      setResult(response);
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Importação e Conexões</h1>
        <p>Conecte seus bancos via Open Finance ou importe extratos manualmente</p>
      </div>

      {/* Open Finance Real-time Connection */}
      <div style={{ marginBottom: '2rem' }}>
        <PluggyWidget onConnectSuccess={(data) => console.log('Banco sincronizado:', data)} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '2rem 0' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border-color)' }}></div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Ou Exporte Manualmente (Fallback via IA)</div>
        <div style={{ flex: 1, height: 1, background: 'var(--border-color)' }}></div>
      </div>

      {/* Account Type Selection */}
      <div className="grid grid-3" style={{ marginBottom: '1.5rem' }}>
        {[
          { key: 'checking', icon: '🏦', label: 'Conta Bancária' },
          { key: 'credit_card', icon: '💳', label: 'Cartão de Crédito' },
          { key: 'investment', icon: '📈', label: 'Corretora de Investimentos' },
        ].map(type => (
          <button key={type.key} className="card" onClick={() => setAccountType(type.key)} style={{
            textAlign: 'center',
            cursor: 'pointer',
            borderColor: accountType === type.key ? 'var(--accent-gold)' : 'var(--border-color)',
            background: accountType === type.key ? 'var(--accent-gold-dim)' : 'var(--bg-card)',
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{type.icon}</div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{type.label}</div>
          </button>
        ))}
      </div>

      {/* Account Name */}
      <div className="form-group" style={{ maxWidth: 500, marginBottom: '1.5rem' }}>
        <label>Nome da Conta (opcional)</label>
        <input placeholder="Ex: Nubank, Itaú, XP..." value={accountName} onChange={e => setAccountName(e.target.value)} />
      </div>

      {/* Upload Zone */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
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
        >
          <input id="file-input" type="file" accept=".pdf,.csv,.xlsx,.ofx" style={{ display: 'none' }} onChange={e => setFile(e.target.files[0])} />
          <div className="upload-zone-icon">📤</div>
          {file ? (
            <>
              <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.25rem' }}>{file.name}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{(file.size / 1024).toFixed(1)} KB</div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.25rem' }}>Arraste seus extratos aqui</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>ou clique para selecionar arquivos</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.5rem' }}>PDF, CSV, XLSX, OFX</div>
            </>
          )}
        </div>

        {file && (
          <div style={{ marginTop: '1rem', textAlign: 'center' }}>
            <button className="btn btn-primary btn-lg" onClick={handleUpload} disabled={uploading}>
              {uploading ? '⏳ Processando...' : '📤 Importar Arquivo'}
            </button>
          </div>
        )}
      </div>

      {/* Result */}
      {result && (
        <div className="card" style={{ borderColor: result.error ? 'var(--color-danger)' : 'var(--color-success)' }}>
          {result.error ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <AlertTriangle size={24} style={{ color: 'var(--color-danger)' }} />
              <div>
                <div style={{ fontWeight: 600, color: 'var(--color-danger)' }}>Erro na importação</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{result.error}</div>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <CheckCircle size={24} style={{ color: 'var(--color-success)' }} />
                <div style={{ fontWeight: 600, color: 'var(--color-success)' }}>Importação Concluída!</div>
              </div>
              <div className="grid grid-3">
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{result.total}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Transações encontradas</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-success)' }}>{result.imported}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Importadas</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-warning)' }}>{result.duplicates}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Duplicatas ignoradas</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Supported Formats */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div style={{ fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Formatos Suportados</div>
        <div className="grid grid-4">
          {['PDF', 'CSV', 'XLSX', 'OFX'].map(fmt => (
            <div key={fmt} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText size={16} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontWeight: 600 }}>{fmt}</span>
            </div>
          ))}
        </div>
        <p style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          A IA da Lume reconhece extratos dos principais bancos brasileiros, cartões de crédito e corretoras de investimento.
        </p>
      </div>
    </div>
  );
}

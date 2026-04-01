import { useState, useCallback, useEffect } from 'react';
import api from '../../services/api';
import { Building2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export default function PluggyWidget({ onConnectSuccess }) {
  const [loadingToken, setLoadingToken] = useState(false);
  const [errorInfo, setErrorInfo] = useState('');
  const [scriptLoaded, setScriptLoaded] = useState(false);

  // Load the Pluggy Connect secure widget on-demand (not on mount) to avoid 404 crash
  const loadScript = useCallback(() => {
    if (window.PluggyConnect) {
      setScriptLoaded(true);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.pluggy.ai/pluggy-connect/v2/pluggy-connect.js';
      script.async = true;
      script.onload = () => { setScriptLoaded(true); resolve(); };
      script.onerror = () => { setErrorInfo('Open Finance temporariamente indisponível. Tente mais tarde ou use importação manual.'); resolve(); };
      document.body.appendChild(script);
    });
  }, []);

  const startConnectFlow = useCallback(async () => {
    await loadScript();
    if (!window.PluggyConnect) {
      setErrorInfo('Open Finance indisponível. Use a importação manual de extratos.');
      return;
    }

    try {
        setLoadingToken(true);
        setErrorInfo('');
        // Request token from Lume Backend
        const response = await api.get('/pluggy/token');
        const token = response.data?.accessToken || response.accessToken;

        if (!token) throw new Error("Backend não retornou token Pluggy");

        const pluggyConnect = new window.PluggyConnect({
            connectToken: token,
            onSuccess: (itemData) => {
                console.log('✅ Banco conectado com sucesso via Pluggy!', itemData);
                if (onConnectSuccess) onConnectSuccess(itemData);
            },
            onError: (err) => {
                console.error('❌ Erro no Flow do Pluggy', err);
                setErrorInfo(err.message || 'Houve um erro durante a conexão bancária.');
            },
            uiParams: {
                primaryColor: '#d4a843',
            }
        });

        // Launch modal
        pluggyConnect.init();

    } catch (err) {
        setErrorInfo('Falha ao instanciar Conexão Open Finance Segura.');
        console.error('Pluggy Token Fetch Error:', err);
    } finally {
        setLoadingToken(false);
    }
  }, [onConnectSuccess]);

  return (
    <div style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
            <div style={{ width: 40, height: 40, background: 'linear-gradient(135deg, #1e293b, #0f1219)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Building2 size={20} color="var(--accent-gold)" />
            </div>
            <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Conexão Open Finance</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Sincronize a sua conta PJ ou PF de forma 100% segura usando o sistema homologado pelo Banco Central brasileiro. Jamais salvaremos suas credenciais.
                </p>
            </div>
        </div>

        {errorInfo && (
            <div style={{ background: 'var(--color-danger-dim)', color: 'var(--color-danger)', padding: '0.75rem', borderRadius: '8px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                <AlertCircle size={14} />
                <span>{errorInfo}</span>
            </div>
        )}

        <button 
           className="btn btn-primary" 
           onClick={startConnectFlow} 
           disabled={loadingToken}
           style={{ width: '100%', display: 'flex', justifyContent: 'center' }}
        >
            {loadingToken ? <RefreshCw size={16} className="animate-pulse" /> : <Building2 size={16} />}
            {loadingToken ? 'Gerando Comunicação Segura...' : 'Conectar Banco Automaticamente'}
        </button>

        <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <CheckCircle2 size={12} color="var(--color-success)" />
            <span>Criptografia Ponta a Ponta 256-bit</span>
        </div>
    </div>
  );
}

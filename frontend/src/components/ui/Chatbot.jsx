import { useWorkspace } from '../../context/WorkspaceContext';
import { useAuth } from '../../context/AuthContext';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Send, X, Sun } from 'lucide-react';
import api from '../../services/api';

function ScopedChatbot({ currentWorkspace, workspaceLabel }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'bot',
      content: 'Olá! Posso explicar seus registros e ajudar a montar um plano financeiro com prioridades e um cenário para revisar.',
      actionHref: '/planejador',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const response = await api.chat(userMsg, { workspace: currentWorkspace, history: messages.slice(-12).map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.content })) });
      setMessages(prev => [...prev, { role: 'bot', content: response.message, actionHref: response.actionHref,
        context: response.period ? `${response.period.startDate} a ${response.period.endDate} · ${response.coverage?.complete ? 'base conciliada' : 'base parcial'}` : null }]);
    } catch {
      setMessages(prev => [...prev, { role: 'bot', content: 'Não foi possível consultar os dados agora. Tente novamente para obter uma resposta com a base conferida.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Toggle Button */}
      <button className="chatbot-toggle" onClick={() => setIsOpen(!isOpen)}>
        <MessageCircle size={20} style={{ color: 'var(--accent-gold)' }} />
        <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Converse com a Lume</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sua assistente financeira</span>
      </button>

      {/* Panel */}
      {isOpen && (
        <div className="chatbot-panel">
          <div className="chatbot-header">
            <Sun size={20} style={{ color: 'var(--accent-gold)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Lume</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{workspaceLabel} · consulta de dados</div>
            </div>
            <button aria-label="Fechar conversa" onClick={() => setIsOpen(false)} style={{ background: 'transparent', color: 'var(--text-muted)' }}>
              <X size={18} />
            </button>
          </div>

          <div className="chatbot-messages" role="log" aria-live="polite">
            {messages.map((msg, i) => (
              <div key={i} className={`chat-message ${msg.role}`}>
                {msg.content}
                {msg.context ? <small style={{ display: 'block', marginTop: '.5rem' }}>{msg.context}</small> : null}
                {msg.actionHref ? <Link to={msg.actionHref} onClick={() => setIsOpen(false)} style={{ display: 'block', marginTop: '.5rem', color: 'var(--accent-gold)' }}>Abrir Planejador financeiro</Link> : null}
              </div>
            ))}
            {loading && (
              <div className="chat-message bot" style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>
                Pensando...
              </div>
            )}
          </div>

          <div className="chatbot-input">
            <input aria-label="Mensagem para a Lume"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Digite sua mensagem..."
              disabled={loading}
            />
            <button aria-label="Enviar mensagem" onClick={sendMessage} disabled={loading} style={{
              background: 'var(--accent-gold)',
              color: 'var(--text-dark)',
              borderRadius: 'var(--border-radius-sm)',
              padding: '0.5rem',
            }}>
              <Send size={16} />
            </button>
          </div>

          <div style={{ padding: '0.5rem 1rem', fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            Experimente: "Quero montar meu plano financeiro"
          </div>
        </div>
      )}
    </>
  );
}
export default function Chatbot() {
  const { currentWorkspace, workspaceLabel } = useWorkspace();
  const { user } = useAuth();
  return <ScopedChatbot key={`${user?.id}:${currentWorkspace}`} currentWorkspace={currentWorkspace} workspaceLabel={workspaceLabel} />;
}

import { useState } from 'react';
import { MessageCircle, Send, X, Sun } from 'lucide-react';
import api from '../../services/api';

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'bot',
      content: 'Olá 👋 Sou a Lume, sua assistente financeira. Posso te ajudar a consultar gastos, lançar transações, analisar suas finanças e muito mais! Como posso te ajudar hoje?',
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
      const response = await api.chat(userMsg);
      setMessages(prev => [...prev, { role: 'bot', content: response.message }]);
    } catch {
      setMessages(prev => [...prev, { role: 'bot', content: 'Desculpe, ocorreu um erro. Tente novamente! 😊' }]);
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
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Assistente Financeira</div>
            </div>
            <button onClick={() => setIsOpen(false)} style={{ background: 'transparent', color: 'var(--text-muted)' }}>
              <X size={18} />
            </button>
          </div>

          <div className="chatbot-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`chat-message ${msg.role}`}>
                {msg.content}
              </div>
            ))}
            {loading && (
              <div className="chat-message bot" style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>
                Pensando...
              </div>
            )}
          </div>

          <div className="chatbot-input">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Digite sua mensagem..."
              disabled={loading}
            />
            <button onClick={sendMessage} disabled={loading} style={{
              background: 'var(--accent-gold)',
              color: 'var(--text-dark)',
              borderRadius: 'var(--border-radius-sm)',
              padding: '0.5rem',
            }}>
              <Send size={16} />
            </button>
          </div>

          <div style={{ padding: '0.5rem 1rem', fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            Experimente: "Quanto gastei em alimentação este mês?"
          </div>
        </div>
      )}
    </>
  );
}

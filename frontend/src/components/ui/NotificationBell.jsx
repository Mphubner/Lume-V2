import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { Bell, AlertCircle, Info, CheckCircle, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function NotificationBell({ isCollapsed }) {
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    
    const loadNotifications = async () => {
      try {
        const data = await api.request('/notifications');
        setNotifications(data || []);
      } catch (err) {
        console.error('Failed to load notifications:', err);
      }
    };

    loadNotifications();
    // In a real app, you might want to setup a Supabase real-time subscription here
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const handleRead = async (notification) => {
    try {
      if (!notification.is_read) {
        await api.request(`/notifications/${notification.id}/read`, { method: 'PUT' });
        setNotifications(notifications.map(n => n.id === notification.id ? { ...n, is_read: true } : n));
      }
      if (notification.link) {
        setIsOpen(false);
        navigate(notification.link);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'warning': return <AlertTriangle size={16} color="#f59e0b" />;
      case 'urgent': return <AlertCircle size={16} color="#f43f5e" />;
      case 'success': return <CheckCircle size={16} color="#22c55e" />;
      default: return <Info size={16} color="#3b82f6" />;
    }
  };

  return (
    <div className="notification-bell-container" ref={dropdownRef} style={{ position: 'relative' }}>
      <button 
        className="bell-btn"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          position: 'relative',
          padding: '0.5rem',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s'
        }}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            background: 'var(--color-danger)',
            color: '#fff',
            fontSize: '0.65rem',
            fontWeight: 700,
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div style={{
          position: 'fixed',
          top: '80px',
          left: isCollapsed ? '90px' : '20px',
          width: '320px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          zIndex: 100,
          marginTop: '0.5rem',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Notificações</h4>
            {unreadCount > 0 && <span style={{ fontSize: '0.75rem', color: 'var(--accent-gold)' }}>{unreadCount} não lidas</span>}
          </div>
          
          <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Nenhuma notificação no momento.
              </div>
            ) : (
              notifications.map(n => (
                <div 
                  key={n.id} 
                  onClick={() => handleRead(n)}
                  style={{
                    padding: '1rem',
                    borderBottom: '1px solid var(--border-color)',
                    background: n.is_read ? 'transparent' : 'rgba(212, 168, 67, 0.05)',
                    cursor: 'pointer',
                    display: 'flex',
                    gap: '0.75rem',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = n.is_read ? 'transparent' : 'rgba(212, 168, 67, 0.05)'}
                >
                  <div style={{ marginTop: '2px' }}>{getIcon(n.type)}</div>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: n.is_read ? 500 : 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                      {n.title}
                    </div>
                    {n.message && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{n.message}</div>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

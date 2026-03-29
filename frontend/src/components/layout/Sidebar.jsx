import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard, BarChart3, Target, Wallet, Shield, Building2, Heart,
  ArrowLeftRight, Receipt, FileText, Scale, Upload, Settings, LogOut,
  Menu, ChevronDown, ChevronRight, Sun
} from 'lucide-react';
import NotificationBell from '../ui/NotificationBell';
import WorkspaceSelector from './WorkspaceSelector';

const navGroups = [
  {
    label: 'Visão Geral',
    icon: LayoutDashboard,
    items: [
      { path: '/dashboard', label: 'Resumo Financeiro', icon: LayoutDashboard },
      { path: '/analytics', label: 'Análise Avançada', icon: BarChart3 },
    ],
  },
  {
    label: 'Minhas Finanças',
    icon: Wallet,
    items: [
      { path: '/metas', label: 'Metas', icon: Target },
      { path: '/orcamento', label: 'Meu Plano do Mês', icon: Wallet },
      { path: '/reserva', label: 'Reserva de Emergência', icon: Shield },
      { path: '/investimentos', label: 'Investimentos', icon: Building2 },
      { path: '/saude', label: 'Diagnóstico', icon: Heart },
    ],
  },
  {
    label: 'Movimentações',
    icon: ArrowLeftRight,
    items: [
      { path: '/lancamentos', label: 'Meus Lançamentos', icon: ArrowLeftRight },
      { path: '/contas-fixas', label: 'Contas Fixas', icon: Receipt },
      { path: '/pendencias', label: 'Minhas Pendências', icon: FileText },
      { path: '/conferir-extratos', label: 'Conferir Extratos', icon: Scale },
      { path: '/importar', label: 'Importar', icon: Upload },
    ],
  },
];

export default function Sidebar({ mobileOpen, onClose }) {
  const { user, profile, isAdmin, signOut } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(
    navGroups.reduce((acc, g) => ({ ...acc, [g.label]: true }), {})
  );

  const toggleGroup = (label) => {
    setExpandedGroups(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const isActive = (path) => {
    if (path === '/dashboard') return location.pathname === '/dashboard';
    return location.pathname.startsWith(path);
  };

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`} style={{
      width: collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)',
      position: 'fixed',
      top: 0,
      left: 0,
      height: '100vh',
      background: 'var(--bg-sidebar)',
      borderRight: '1px solid var(--border-color)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 50,
      overflow: 'hidden',
    }}>
      {/* Logo */}
      <div style={{
        display: 'flex',
        flexDirection: collapsed ? 'column' : 'row',
        alignItems: 'center',
        gap: collapsed ? '1.5rem' : '0.75rem',
        padding: collapsed ? '1.25rem 0' : '1.25rem 1rem',
        borderBottom: '1px solid var(--border-color)',
      }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: 'linear-gradient(135deg, #d4a843, #f59e0b)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Sun size={22} color="#0f1219" />
        </div>
        {!collapsed && (
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.125rem', color: 'var(--text-primary)' }}>Lume</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Clareza financeira</div>
          </div>
        )}
        <div style={{ 
          marginLeft: collapsed ? '0' : 'auto', 
          display: 'flex', 
          flexDirection: collapsed ? 'column' : 'row',
          alignItems: 'center', 
          gap: collapsed ? '1.5rem' : '0.5rem' 
        }}>
          <NotificationBell isCollapsed={collapsed} />
          {/* Menu button hidden on mobile since Navbar handles it, but keeps collapse for Desktop */}
          <button className="desktop-collapse-btn" onClick={() => setCollapsed(!collapsed)} style={{
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            padding: '0.4rem',
            borderRadius: '50%',
            border: '1px solid var(--border-color)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Menu size={16} />
          </button>
        </div>
      </div>

      <WorkspaceSelector isCollapsed={collapsed} />

      {/* Navigation */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: '0.5rem', marginTop: '0.5rem' }}>
        {/* Admin link */}
        {isAdmin && (
          <NavLink to="/admin" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.625rem 0.75rem',
            borderRadius: 'var(--border-radius-sm)',
            color: isActive('/admin') ? 'var(--accent-gold)' : 'var(--text-secondary)',
            background: isActive('/admin') ? 'var(--accent-gold-dim)' : 'transparent',
            borderLeft: isActive('/admin') ? '3px solid var(--accent-gold)' : '3px solid transparent',
            fontSize: '0.85rem',
            fontWeight: 500,
            marginBottom: '0.5rem',
            textDecoration: 'none',
          }}>
            <Settings size={18} />
            {!collapsed && 'Admin Dashboard'}
          </NavLink>
        )}

        {navGroups.map((group) => (
          <div key={group.label} style={{ marginBottom: '0.25rem' }}>
            {/* Group header */}
            <button onClick={() => toggleGroup(group.label)} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              width: '100%',
              padding: '0.5rem 0.75rem',
              color: 'var(--text-muted)',
              background: 'transparent',
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}>
              {!collapsed && (
                <>
                  {group.label}
                  <span style={{ marginLeft: 'auto' }}>
                    {expandedGroups[group.label] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </span>
                </>
              )}
            </button>

            {/* Items */}
            {(expandedGroups[group.label] || collapsed) && group.items.map((item) => (
              <NavLink key={item.path} to={item.path} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.5rem 0.75rem',
                paddingLeft: collapsed ? '0.75rem' : '1.5rem',
                borderRadius: 'var(--border-radius-sm)',
                color: isActive(item.path) ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: isActive(item.path) ? 'var(--accent-gold-dim)' : 'transparent',
                borderLeft: isActive(item.path) ? '3px solid var(--accent-gold)' : '3px solid transparent',
                fontSize: '0.85rem',
                fontWeight: isActive(item.path) ? 600 : 400,
                textDecoration: 'none',
                transition: 'all var(--transition-fast)',
                marginBottom: '0.125rem',
              }}>
                <item.icon size={18} style={{
                  color: isActive(item.path) ? 'var(--accent-gold)' : 'var(--text-muted)',
                  flexShrink: 0,
                }} />
                {!collapsed && item.label}
                {isActive(item.path) && !collapsed && (
                  <ChevronRight size={14} style={{ marginLeft: 'auto', color: 'var(--accent-gold)' }} />
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* User area */}
      <div style={{
        borderTop: '1px solid var(--border-color)',
        padding: '0.75rem 1rem',
      }}>
        <NavLink to="/configuracoes" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          textDecoration: 'none',
          marginBottom: '0.5rem',
        }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'var(--accent-gold)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-dark)',
            fontWeight: 700,
            fontSize: '0.9rem',
            flexShrink: 0,
          }}>
            {(profile?.full_name || user?.email || 'U')[0].toUpperCase()}
          </div>
          {!collapsed && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {profile?.full_name || 'Usuário'}
              </div>
              <div style={{
                fontSize: '0.7rem',
                color: 'var(--text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {user?.email}
              </div>
            </div>
          )}
          {!collapsed && <Settings size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
        </NavLink>

        <button onClick={signOut} style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          width: '100%',
          padding: '0.5rem 0.75rem',
          background: 'transparent',
          color: 'var(--text-muted)',
          fontSize: '0.85rem',
          borderRadius: 'var(--border-radius-sm)',
        }}>
          <LogOut size={18} />
          {!collapsed && 'Sair'}
        </button>
      </div>
    </aside>
  );
}

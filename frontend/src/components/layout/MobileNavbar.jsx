import { Menu, Sun } from 'lucide-react';

export default function MobileNavbar({ onOpenMenu }) {
  return (
    <div className="mobile-navbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--accent-gold)' }}>
        <Sun size={28} strokeWidth={1.5} />
        <span style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>Lume</span>
      </div>
      
      <button 
        onClick={onOpenMenu}
        style={{
          background: 'transparent',
          color: 'var(--text-primary)',
          padding: '0.5rem',
          borderRadius: 'var(--border-radius-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Menu size={24} />
      </button>
    </div>
  );
}

import { Menu, Sun } from 'lucide-react';

export default function MobileNavbar({ onOpenMenu }) {
  return (
    <div className="mobile-navbar">
      {/* Spacer to perfectly center the logo given the right hamburger button */}
      <div style={{ width: 40 }} />
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-gold)' }}>
        <Sun size={24} strokeWidth={2} />
        <span style={{ fontSize: '1.2rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>Lume</span>
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
          justifyContent: 'center',
          width: 40
        }}
      >
        <Menu size={24} />
      </button>
    </div>
  );
}

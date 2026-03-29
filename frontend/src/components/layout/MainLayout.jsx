import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileNavbar from './MobileNavbar';
import Chatbot from '../ui/Chatbot';

export default function MainLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Fecha o menu de mobile automaticamente ao navegar
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-layout">
      <MobileNavbar onOpenMenu={() => setMobileMenuOpen(true)} />
      
      {/* Overlay escuro em mobile escurece a tela ao puxar a gaveta */}
      <div 
        className={`sidebar-overlay ${mobileMenuOpen ? 'active' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      <Sidebar mobileOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
      <main className="main-content">
        <Outlet />
      </main>
      <Chatbot />
    </div>
  );
}

import ApiStatus from '../ui/ApiStatus';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAuth } from '../../context/AuthContext';
import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import Sidebar from './Sidebar';
import MobileNavbar from './MobileNavbar';
import Chatbot from '../ui/Chatbot';

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

export default function MainLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();


  return (
    <div className="app-layout">
      <MobileNavbar onOpenMenu={() => setMobileMenuOpen(true)} />

      {/* Overlay escuro em mobile escurece a tela ao puxar a gaveta */}
      <div
        className={`sidebar-overlay ${mobileMenuOpen ? 'active' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      <Sidebar key={user?.id} mobileOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
      <main className="main-content">
        <AnimatePresence mode="wait">
          <Motion.div
            key={`${user?.id}:${currentWorkspace}:${location.pathname}`}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <ApiStatus /><Outlet />
          </Motion.div>
        </AnimatePresence>
      </main>
      <Chatbot key={`${user?.id}:${currentWorkspace}`} />
    </div>
  );
}

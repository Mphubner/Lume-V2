import { useState, useEffect, useRef } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

const OVERLAY_VARIANTS = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const SHEET_VARIANTS = {
  hidden: { y: '100%' },
  visible: { y: 0, transition: { type: 'spring', damping: 30, stiffness: 300 } },
  exit: { y: '100%', transition: { duration: 0.25 } },
};

const MODAL_VARIANTS = {
  hidden: { opacity: 0, scale: 0.95, x: '-50%', y: '-40%' },
  visible: { opacity: 1, scale: 1, x: '-50%', y: '-50%', transition: { type: 'spring', damping: 25, stiffness: 300 } },
  exit: { opacity: 0, scale: 0.95, x: '-50%', y: '-40%', transition: { duration: 0.2 } },
};

export default function BottomSheet({ isOpen, onClose, title, children, maxWidth = 520 }) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 900);
  const dialogRef = useRef(null);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement;
    const focusable = () => [...(dialogRef.current?.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], textarea:not([disabled])') || [])];
    const timer = setTimeout(() => focusable()[0]?.focus(), 0);
    const keydown = event => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const items = focusable(); const first = items[0]; const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { clearTimeout(timer); document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [isOpen, onClose]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 900);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <Motion.div
            className="modal-overlay"
            variants={OVERLAY_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            style={{ zIndex: 100 }}
          />

          {isMobile ? (
            /* ===== MOBILE: Bottom Sheet ===== */
            <Motion.div
              ref={dialogRef} role="dialog" aria-modal="true" aria-label={title}
              variants={SHEET_VARIANTS}
              initial="hidden"
              animate="visible"
              exit="exit"
              drag="y"
              dragConstraints={{ top: 0 }}
              dragElastic={0.2}
              onDragEnd={(_, info) => {
                if (info.offset.y > 100 || info.velocity.y > 500) onClose();
              }}
              style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 101,
                background: 'var(--bg-secondary)',
                borderRadius: '20px 20px 0 0',
                maxHeight: '90vh',
                overflowY: 'auto',
                boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
              }}
            >
              {/* Drag Handle */}
              <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
                <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--text-muted)', opacity: 0.5 }} />
              </div>

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 1.25rem 1rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{title}</h3>
                <button aria-label="Fechar janela" onClick={onClose} style={{ background: 'transparent', color: 'var(--text-muted)', padding: '0.25rem' }}>
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div style={{ padding: '0 1.25rem 1.5rem' }}>
                {children}
              </div>
            </Motion.div>
          ) : (
            /* ===== DESKTOP: Centered Modal ===== */
            <Motion.div
              ref={dialogRef} role="dialog" aria-modal="true" aria-label={title}
              variants={MODAL_VARIANTS}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 101,
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--border-radius-lg)',
                width: '90%',
                maxWidth,
                maxHeight: '85vh',
                overflowY: 'auto',
                boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                border: '1px solid var(--border-color)',
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{title}</h3>
                <button aria-label="Fechar janela" onClick={onClose} style={{ background: 'transparent', color: 'var(--text-muted)', padding: '0.25rem' }}>
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div style={{ padding: '1.25rem 1.5rem' }}>
                {children}
              </div>
            </Motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}

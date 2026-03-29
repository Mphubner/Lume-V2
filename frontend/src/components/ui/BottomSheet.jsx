import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
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
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', damping: 25, stiffness: 300 } },
  exit: { opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.2 } },
};

export default function BottomSheet({ isOpen, onClose, title, children, maxWidth = 520 }) {
  const [isMobile, setIsMobile] = useState(false);

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
          <motion.div
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
            <motion.div
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
                <button onClick={onClose} style={{ background: 'transparent', color: 'var(--text-muted)', padding: '0.25rem' }}>
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div style={{ padding: '0 1.25rem 1.5rem' }}>
                {children}
              </div>
            </motion.div>
          ) : (
            /* ===== DESKTOP: Centered Modal ===== */
            <motion.div
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
                <button onClick={onClose} style={{ background: 'transparent', color: 'var(--text-muted)', padding: '0.25rem' }}>
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div style={{ padding: '1.25rem 1.5rem' }}>
                {children}
              </div>
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}

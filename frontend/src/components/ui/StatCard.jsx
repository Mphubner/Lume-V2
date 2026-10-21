import { motion as Motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.08,
      type: 'spring',
      stiffness: 260,
      damping: 20,
    },
  }),
};

export default function StatCard({ label, value, sub, icon, variant = 'neutral', className = '', index = 0, alert: hasAlert = false, onClick }) {
  return (
    <Motion.div
      className={`stat-card ${variant} ${className} ${hasAlert ? 'stat-card-alert' : ''}`}
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : {}}
    >
      {hasAlert && (
        <Motion.div
          className="stat-card-alert-icon"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <AlertTriangle size={16} />
        </Motion.div>
      )}
      {icon && <div className="stat-card-icon">{icon}</div>}
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{value}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </Motion.div>
  );
}

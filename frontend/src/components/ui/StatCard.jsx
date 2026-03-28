export default function StatCard({ label, value, sub, icon, variant = 'neutral', className = '' }) {
  return (
    <div className={`stat-card ${variant} ${className}`}>
      {icon && <div className="stat-card-icon">{icon}</div>}
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{value}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
  );
}

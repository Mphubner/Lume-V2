import { motion } from 'framer-motion';

const shimmerStyle = {
  background: 'linear-gradient(90deg, var(--bg-secondary) 25%, var(--bg-card) 50%, var(--bg-secondary) 75%)',
  backgroundSize: '200% 100%',
  borderRadius: 'var(--border-radius-sm)',
};

const shimmerAnimation = {
  animate: { backgroundPosition: ['200% 0', '-200% 0'] },
  transition: { duration: 1.5, repeat: Infinity, ease: 'linear' },
};

export function SkeletonText({ width = '100%', height = 14, style = {} }) {
  return (
    <motion.div
      style={{ ...shimmerStyle, width, height, ...style }}
      {...shimmerAnimation}
    />
  );
}

export function SkeletonCard({ height = 120, style = {} }) {
  return (
    <motion.div
      style={{ ...shimmerStyle, width: '100%', height, borderRadius: 'var(--border-radius-md)', ...style }}
      {...shimmerAnimation}
    />
  );
}

export function SkeletonCircle({ size = 40, style = {} }) {
  return (
    <motion.div
      style={{ ...shimmerStyle, width: size, height: size, borderRadius: '50%', ...style }}
      {...shimmerAnimation}
    />
  );
}

export function SkeletonChart({ height = 200, style = {} }) {
  return (
    <div className="card" style={{ padding: '1.5rem', ...style }}>
      <SkeletonText width="40%" height={16} style={{ marginBottom: '1rem' }} />
      <SkeletonCard height={height} />
    </div>
  );
}

// Dashboard-specific skeleton
export function DashboardSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header skeleton */}
      <div>
        <SkeletonText width={220} height={24} style={{ marginBottom: 8 }} />
        <SkeletonText width={300} height={14} />
      </div>

      {/* Stat cards skeleton */}
      <div className="grid grid-2" style={{ gap: '1rem' }}>
        {[1, 2, 3, 4].map(i => (
          <SkeletonCard key={i} height={100} />
        ))}
      </div>

      {/* Charts skeleton */}
      <div className="grid grid-2" style={{ gap: '1rem' }}>
        <SkeletonChart height={250} />
        <SkeletonChart height={250} />
      </div>
    </div>
  );
}

export function TransactionsSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {[1, 2, 3, 4, 5, 6].map(i => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem' }}>
          <SkeletonCircle size={36} />
          <div style={{ flex: 1 }}>
            <SkeletonText width="60%" height={14} style={{ marginBottom: 6 }} />
            <SkeletonText width="30%" height={11} />
          </div>
          <SkeletonText width={80} height={16} />
        </div>
      ))}
    </div>
  );
}

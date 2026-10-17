import React from 'react';

/** Loading placeholder. Matches the shape of what is about to appear. */
export function Skeleton({ width = '100%', height = 12, radius = 'var(--radius)', style, ...rest }) {
  return (
    <span
      aria-hidden="true"
      {...rest}
      style={{
        display: 'block', width, height, borderRadius: radius,
        background: 'linear-gradient(90deg,var(--surface-skeleton) 0%,var(--surface-skeleton-shine) 50%,var(--surface-skeleton) 100%)',
        backgroundSize: '200% 100%',
        animation: 'af-skeleton 1.2s ease-in-out infinite',
        ...style,
      }}
    />
  );
}

/** N skeleton rows at table rhythm. */
export function SkeletonRows({ rows = 4, height = 'var(--row-height)', style, ...rest }) {
  return (
    <div {...rest} style={{ display: 'flex', flexDirection: 'column', ...style }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-150)', height, padding: '0 var(--space-100)', borderBottom: 'var(--border-width) solid var(--border)' }}>
          <Skeleton width={16} height={16} />
          <Skeleton width={`${40 + (i % 3) * 12}%`} />
          <Skeleton width={72} height={16} style={{ marginLeft: 'auto' }} />
        </div>
      ))}
    </div>
  );
}

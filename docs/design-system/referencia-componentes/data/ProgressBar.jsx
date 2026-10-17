import React from 'react';

const TONES = { brand: 'var(--progress-brand)', success: 'var(--progress-success)', warning: 'var(--progress-warning)', danger: 'var(--danger)', neutral: 'var(--progress-neutral)' };

/** Thin completion bar for a campaign or a client's monthly plan. */
export function ProgressBar({ value = 0, max = 100, tone = 'brand', label, caption, style, ...rest }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div {...rest} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-050)', ...style }}>
      {label || caption ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-100)', font: 'var(--text-label)', color: 'var(--text-subtle)' }}>
          <span>{label}</span><span>{caption}</span>
        </div>
      ) : null}
      <div
        role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}
        style={{ height: 4, width: '100%', background: 'var(--surface-hover)', borderRadius: 'var(--radius-pill)', overflow: 'hidden' }}
      >
        <div style={{ height: '100%', width: `${pct}%`, background: TONES[tone] || TONES.brand, borderRadius: 'var(--radius-pill)', transition: 'width var(--duration-medium) var(--ease-out)' }} />
      </div>
    </div>
  );
}

import React from 'react';

const TONES = {
  default: ['var(--lozenge-default-bg)', 'var(--lozenge-default-text)'],
  inprogress: ['var(--lozenge-inprogress-bg)', 'var(--lozenge-inprogress-text)'],
  review: ['var(--lozenge-review-bg)', 'var(--lozenge-review-text)'],
  success: ['var(--lozenge-success-bg)', 'var(--lozenge-success-text)'],
  warning: ['var(--lozenge-warning-bg)', 'var(--lozenge-warning-text)'],
  danger: ['var(--lozenge-danger-bg)', 'var(--lozenge-danger-text)'],
};

/** Status pill: washed background, dark text, 11px uppercase. */
export function Lozenge({ tone = 'default', children, style, ...rest }) {
  const [bg, fg] = TONES[tone] || TONES.default;
  return (
    <span
      {...rest}
      style={{
        display: 'inline-flex', alignItems: 'center', maxWidth: '200px',
        padding: '0 var(--space-075)', height: '16px',
        background: bg, color: fg,
        borderRadius: 'var(--radius)',
        font: 'var(--text-uppercase)', letterSpacing: 'var(--tracking-uppercase)',
        textTransform: 'uppercase', whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

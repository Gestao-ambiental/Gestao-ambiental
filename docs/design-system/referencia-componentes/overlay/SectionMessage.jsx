import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { IconButton } from '../core/IconButton.jsx';

const TONES = {
  info: { bg: 'var(--lozenge-inprogress-bg)', fg: 'var(--lozenge-inprogress-text)', icon: 'info' },
  success: { bg: 'var(--lozenge-success-bg)', fg: 'var(--lozenge-success-text)', icon: 'circle-check' },
  warning: { bg: 'var(--lozenge-warning-bg)', fg: 'var(--lozenge-warning-text)', icon: 'triangle-alert' },
  danger: { bg: 'var(--lozenge-danger-bg)', fg: 'var(--lozenge-danger-text)', icon: 'circle-alert' },
};

/** In-page message block. Sits inside the content column, never floats. */
export function SectionMessage({ tone = 'info', title, children, actions, onDismiss, style, ...rest }) {
  const t = TONES[tone] || TONES.info;
  return (
    <div
      {...rest}
      style={{
        display: 'flex', gap: 'var(--space-100)',
        padding: 'var(--space-150)',
        background: t.bg, borderRadius: 'var(--radius)',
        ...style,
      }}
    >
      <Icon name={t.icon} size={16} style={{ backgroundColor: t.fg, marginTop: 2 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-050)' }}>
        {title ? <div style={{ font: 'var(--font-weight-semibold) var(--font-size-100)/20px var(--font-family)', color: 'var(--text)' }}>{title}</div> : null}
        {children ? <div style={{ font: 'var(--text-body)', color: 'var(--text)', textWrap: 'pretty' }}>{children}</div> : null}
        {actions ? <div style={{ display: 'flex', gap: 'var(--space-100)', marginTop: 'var(--space-050)' }}>{actions}</div> : null}
      </div>
      {onDismiss ? <IconButton icon="x" label="Dispensar" size="compact" onClick={onDismiss} /> : null}
    </div>
  );
}

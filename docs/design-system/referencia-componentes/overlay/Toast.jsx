import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { IconButton } from '../core/IconButton.jsx';

const ICONS = { info: 'info', success: 'circle-check', warning: 'triangle-alert', danger: 'circle-alert' };
const COLORS = { info: 'var(--icon-on-inverse-info)', success: 'var(--icon-on-inverse-success)', warning: 'var(--icon-on-inverse-warning)', danger: 'var(--icon-on-inverse-danger)' };

/** Transient confirmation, bottom-left. Dark surface in both themes. */
export function Toast({ tone = 'info', children, action, onDismiss, style, ...rest }) {
  return (
    <div
      role="status"
      {...rest}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 'var(--space-100)',
        maxWidth: 420, padding: 'var(--space-100) var(--space-100) var(--space-100) var(--space-150)',
        background: 'var(--surface-inverse)', color: 'var(--text-on-inverse)',
        borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-overlay)',
        font: 'var(--text-body)',
        animation: 'af-overlay-in var(--duration-medium) var(--ease-out)',
        ...style,
      }}
    >
      <Icon name={ICONS[tone] || ICONS.info} size={16} style={{ backgroundColor: COLORS[tone] || COLORS.info }} />
      <span style={{ flex: 1 }}>{children}</span>
      {action ? <span style={{ color: 'var(--text-link-inverse)', fontWeight: 'var(--font-weight-medium)', cursor: 'pointer' }}>{action}</span> : null}
      {onDismiss ? <IconButton icon="x" label="Fechar" size="compact" onClick={onDismiss} style={{ color: 'var(--text-on-inverse)' }} /> : null}
    </div>
  );
}

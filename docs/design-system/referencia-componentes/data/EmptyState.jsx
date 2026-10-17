import React from 'react';
import { Icon } from '../core/Icon.jsx';

/** Centred empty state. Plain type, one icon, at most one primary action. */
export function EmptyState({ icon = 'inbox', title, description, primaryAction, secondaryAction, style, ...rest }) {
  return (
    <div
      {...rest}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 'var(--space-100)', padding: 'var(--space-600) var(--space-300)', textAlign: 'center',
        ...style,
      }}
    >
      <Icon name={icon} size={24} style={{ backgroundColor: 'var(--icon-disabled)' }} />
      <div style={{ font: 'var(--text-section-title)', color: 'var(--text)' }}>{title}</div>
      {description ? (
        <div style={{ maxWidth: 380, font: 'var(--text-body)', color: 'var(--text-subtle)', textWrap: 'pretty' }}>{description}</div>
      ) : null}
      {primaryAction || secondaryAction ? (
        <div style={{ display: 'flex', gap: 'var(--space-100)', marginTop: 'var(--space-100)' }}>{primaryAction}{secondaryAction}</div>
      ) : null}
    </div>
  );
}

import React from 'react';
import { IconButton } from '../core/IconButton.jsx';

/** Centred modal on a dimmed page. One of the two places shadow is allowed. */
export function Modal({ isOpen = true, title, children, actions, width = 480, onClose, style, ...rest }) {
  if (!isOpen) return null;
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: 'var(--space-800) var(--space-200)',
        background: 'var(--scrim)', overflowY: 'auto',
      }}
      onClick={onClose}
    >
      <div
        role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}
        onClick={(e) => e.stopPropagation()}
        {...rest}
        style={{
          width: '100%', maxWidth: width,
          background: 'var(--surface-overlay)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-overlay)',
          animation: 'af-overlay-in var(--duration-medium) var(--ease-out)',
          ...style,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-100)', padding: 'var(--space-300) var(--space-300) var(--space-100)' }}>
          <h2 style={{ flex: 1, margin: 0, font: 'var(--text-screen-title)', color: 'var(--text)' }}>{title}</h2>
          {onClose ? <IconButton icon="x" label="Fechar" onClick={onClose} /> : null}
        </div>
        <div style={{ padding: '0 var(--space-300)', font: 'var(--text-body)', color: 'var(--text)' }}>{children}</div>
        {actions ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-100)', padding: 'var(--space-300)' }}>{actions}</div>
        ) : <div style={{ height: 'var(--space-300)' }} />}
      </div>
    </div>
  );
}

import React from 'react';

/** White surface with a 1px border. Shadow is not a card affordance in AgroFuturo. */
export function Card({ children, title, actions, padding = 'default', isHoverable = false, isSelected = false, onClick, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const pad = padding === 'none' ? 0 : padding === 'compact' ? 'var(--space-150)' : 'var(--space-200)';
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      {...rest}
      style={{
        background: isSelected ? 'var(--surface-selected)' : isHoverable && hover ? 'var(--surface-hover)' : 'var(--surface-raised)',
        border: `var(--border-width) solid ${isSelected ? 'var(--brand)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        cursor: onClick ? 'pointer' : undefined,
        transition: 'var(--transition-state)',
        ...style,
      }}
    >
      {title || actions ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-100)',
          padding: `var(--space-150) ${padding === 'none' ? 'var(--space-200)' : pad}`,
          borderBottom: 'var(--border-width) solid var(--border)',
        }}>
          <h3 style={{ margin: 0, font: 'var(--text-section-title)', color: 'var(--text)' }}>{title}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-050)' }}>{actions}</div>
        </div>
      ) : null}
      <div style={{ padding: pad }}>{children}</div>
    </div>
  );
}

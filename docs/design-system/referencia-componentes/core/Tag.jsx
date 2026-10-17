import React from 'react';
import { Icon } from './Icon.jsx';

/** Neutral chip for labels, filters and metadata. */
export function Tag({ children, color, onRemove, href, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const El = href ? 'a' : 'span';
  return (
    <El
      href={href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      {...rest}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 'var(--space-050)',
        height: '20px', padding: '0 var(--space-075)',
        background: hover && (href || onRemove) ? 'var(--surface-pressed)' : 'var(--surface-hover)',
        color: 'var(--text)', textDecoration: 'none',
        border: 'var(--border-width) solid transparent',
        borderRadius: 'var(--radius)',
        font: 'var(--font-weight-regular) var(--font-size-075)/16px var(--font-family)',
        maxWidth: '180px', whiteSpace: 'nowrap',
        transition: 'var(--transition-state)',
        ...style,
      }}
    >
      {color ? <span style={{ width: 6, height: 6, borderRadius: 'var(--radius-circle)', background: color, flex: '0 0 auto' }} /> : null}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>
      {onRemove ? (
        <span
          role="button" aria-label="Remover" onClick={(e) => { e.preventDefault(); onRemove(e); }}
          style={{ display: 'inline-flex', cursor: 'pointer', color: 'var(--icon-subtle)' }}
        >
          <Icon name="x" size={12} />
        </span>
      ) : null}
    </El>
  );
}

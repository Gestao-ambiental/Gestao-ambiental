import React from 'react';
import { ClientMark } from '../core/ClientMark.jsx';
import { Icon } from '../core/Icon.jsx';

/** Client tile: sigla block in the client's identity colour, plus production counts. */
export function ClientCard({ name, sigla, slot = 1, meta, stats = [], onClick, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      {...rest}
      style={{
        display: 'flex', flexDirection: 'column', gap: 'var(--space-150)',
        padding: 'var(--space-200)',
        background: hover && onClick ? 'var(--surface-hover)' : 'var(--surface-raised)',
        border: 'var(--border-width) solid var(--border)',
        borderRadius: 'var(--radius)',
        cursor: onClick ? 'pointer' : undefined,
        transition: 'var(--transition-state)',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-150)' }}>
        <ClientMark name={name} sigla={sigla} slot={slot} size="xlarge" />
        <div style={{ minWidth: 0 }}>
          <div style={{ font: 'var(--text-section-title)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
          {meta ? <div style={{ font: 'var(--font-weight-regular) var(--font-size-075)/16px var(--font-family)', color: 'var(--text-subtle)' }}>{meta}</div> : null}
        </div>
        {onClick ? <Icon name="chevron-right" size={16} style={{ marginLeft: 'auto', backgroundColor: 'var(--icon-subtle)' }} /> : null}
      </div>
      {stats.length ? (
        <div style={{ display: 'flex', gap: 'var(--space-300)', borderTop: 'var(--border-width) solid var(--border)', paddingTop: 'var(--space-150)' }}>
          {stats.map((s, i) => (
            <div key={i}>
              <div style={{ font: 'var(--font-weight-semibold) var(--font-size-200)/20px var(--font-family)', color: 'var(--text)' }}>{s.value}</div>
              <div style={{ font: 'var(--text-label)', color: 'var(--text-subtle)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

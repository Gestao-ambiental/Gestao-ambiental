import React from 'react';

/** Underlined tab bar for switching views within one screen. */
export function Tabs({ items = [], selected, defaultSelected, onSelect, style, ...rest }) {
  const first = items[0] && (typeof items[0] === 'string' ? items[0] : items[0].id);
  const [inner, setInner] = React.useState(defaultSelected !== undefined ? defaultSelected : first);
  const isControlled = selected !== undefined;
  const active = isControlled ? selected : inner;
  return (
    <div
      role="tablist"
      {...rest}
      style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-200)', borderBottom: 'var(--border-width) solid var(--border)', ...style }}
    >
      {items.map((raw) => {
        const it = typeof raw === 'string' ? { id: raw, label: raw } : raw;
        const on = it.id === active;
        return <Tab key={it.id} item={it} isActive={on} onSelect={() => { if (!isControlled) setInner(it.id); if (onSelect) onSelect(it.id); }} />;
      })}
    </div>
  );
}

function Tab({ item, isActive, onSelect }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button" role="tab" aria-selected={isActive} onClick={onSelect}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        appearance: 'none', background: 'none', cursor: 'pointer',
        padding: 'var(--space-050) 0 var(--space-100)',
        border: 'none', borderBottom: `2px solid ${isActive ? 'var(--brand)' : hover ? 'var(--border-strong)' : 'transparent'}`,
        marginBottom: '-1px',
        color: isActive ? 'var(--text-link)' : 'var(--text-subtle)',
        font: 'var(--text-body-medium)',
        display: 'flex', alignItems: 'center', gap: 'var(--space-075)',
        transition: 'var(--transition-state)',
      }}
    >
      {item.label}
      {item.count !== undefined ? (
        <span style={{
          padding: '0 var(--space-075)', borderRadius: 'var(--radius-pill)',
          background: isActive ? 'var(--surface-selected)' : 'var(--surface-hover)',
          color: isActive ? 'var(--text-link)' : 'var(--text-subtle)',
          font: 'var(--text-label)',
        }}>{item.count}</span>
      ) : null}
    </button>
  );
}

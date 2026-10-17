import React from 'react';
import { Icon } from '../core/Icon.jsx';

/** Anchored menu. Renders its trigger and positions the list under it. */
export function DropdownMenu({ trigger, items = [], align = 'left', width = 220, onSelect, style, ...rest }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    function away(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);
  return (
    <div ref={ref} {...rest} style={{ position: 'relative', display: 'inline-flex', ...style }}>
      <span onClick={() => setOpen((o) => !o)} style={{ display: 'inline-flex' }}>{trigger}</span>
      {open ? (
        <div
          role="menu"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', zIndex: 80,
            [align === 'right' ? 'right' : 'left']: 0,
            minWidth: width, padding: 'var(--space-050) 0',
            background: 'var(--surface-overlay)',
            border: 'var(--border-width) solid var(--border)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-overlay)',
            animation: 'af-overlay-in var(--duration-fast) var(--ease-out)',
          }}
        >
          {items.map((raw, i) => {
            if (raw === '-' || raw.type === 'separator') return <div key={i} style={{ height: 1, background: 'var(--border)', margin: 'var(--space-050) 0' }} />;
            if (raw.type === 'heading') return <div key={i} style={{ padding: 'var(--space-075) var(--space-150) var(--space-050)', font: 'var(--text-uppercase)', letterSpacing: 'var(--tracking-uppercase)', textTransform: 'uppercase', color: 'var(--text-subtlest)' }}>{raw.label}</div>;
            return <MenuRow key={i} item={raw} onSelect={() => { setOpen(false); if (onSelect) onSelect(raw); if (raw.onClick) raw.onClick(); }} />;
          })}
        </div>
      ) : null}
    </div>
  );
}

function MenuRow({ item, onSelect }) {
  const [hover, setHover] = React.useState(false);
  const danger = item.tone === 'danger';
  return (
    <div
      role="menuitem" onClick={item.isDisabled ? undefined : onSelect}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-100)',
        height: 'var(--size-control)', padding: '0 var(--space-150)',
        background: item.isSelected ? 'var(--surface-selected)' : hover && !item.isDisabled ? 'var(--surface-hover)' : 'transparent',
        color: item.isDisabled ? 'var(--text-disabled)' : danger ? 'var(--text-danger)' : item.isSelected ? 'var(--text-link)' : 'var(--text)',
        font: 'var(--text-body)',
        cursor: item.isDisabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
        transition: 'var(--transition-state)',
      }}
    >
      {item.icon ? <Icon name={item.icon} size={16} /> : null}
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.isSelected ? <Icon name="check" size={16} /> : null}
      {item.shortcut ? <span style={{ font: 'var(--font-weight-regular) var(--font-size-075)/16px var(--font-mono)', color: 'var(--text-subtlest)' }}>{item.shortcut}</span> : null}
    </div>
  );
}

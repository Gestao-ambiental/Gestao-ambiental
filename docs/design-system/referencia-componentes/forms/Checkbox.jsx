import React from 'react';
import { Icon } from '../core/Icon.jsx';

/** 16px checkbox with an optional inline label. */
export function Checkbox({ label, checked, defaultChecked, isIndeterminate = false, isDisabled = false, onChange, id, style, ...rest }) {
  const [inner, setInner] = React.useState(Boolean(defaultChecked));
  const isControlled = checked !== undefined;
  const on = isControlled ? checked : inner;
  const [hover, setHover] = React.useState(false);
  const marked = on || isIndeterminate;
  return (
    <label
      htmlFor={id}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-100)', cursor: isDisabled ? 'not-allowed' : 'pointer', ...style }}
    >
      <input
        id={id} type="checkbox" checked={on} disabled={isDisabled}
        onChange={(e) => { if (!isControlled) setInner(e.target.checked); if (onChange) onChange(e); }}
        {...rest}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
      />
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto',
        width: 16, height: 16, borderRadius: '2px',
        background: isDisabled ? 'var(--surface-disabled)' : marked ? 'var(--brand)' : hover ? 'var(--surface-hover)' : 'var(--surface-input)',
        border: `var(--border-width) solid ${isDisabled ? 'var(--border)' : marked ? 'var(--brand)' : hover ? 'var(--border-strong)' : 'var(--border-input)'}`,
        color: isDisabled ? 'var(--text-disabled)' : 'var(--text-inverse)',
        transition: 'var(--transition-state)',
      }}>
        {isIndeterminate ? <span style={{ width: 8, height: 2, background: 'currentColor' }} /> : on ? <Icon name="check" size={12} /> : null}
      </span>
      {label ? <span style={{ font: 'var(--text-body)', color: isDisabled ? 'var(--text-disabled)' : 'var(--text)' }}>{label}</span> : null}
    </label>
  );
}

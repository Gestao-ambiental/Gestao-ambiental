import React from 'react';

/** Radio control; render several with the same `name`. */
export function Radio({ label, checked, defaultChecked, isDisabled = false, onChange, id, name, style, ...rest }) {
  const [inner, setInner] = React.useState(Boolean(defaultChecked));
  const isControlled = checked !== undefined;
  const on = isControlled ? checked : inner;
  const [hover, setHover] = React.useState(false);
  return (
    <label
      htmlFor={id}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-100)', cursor: isDisabled ? 'not-allowed' : 'pointer', ...style }}
    >
      <input
        id={id} name={name} type="radio" checked={on} disabled={isDisabled}
        onChange={(e) => { if (!isControlled) setInner(e.target.checked); if (onChange) onChange(e); }}
        {...rest}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
      />
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto',
        width: 16, height: 16, borderRadius: 'var(--radius-circle)',
        background: isDisabled ? 'var(--surface-disabled)' : on ? 'var(--brand)' : hover ? 'var(--surface-hover)' : 'var(--surface-input)',
        border: `var(--border-width) solid ${isDisabled ? 'var(--border)' : on ? 'var(--brand)' : hover ? 'var(--border-strong)' : 'var(--border-input)'}`,
        transition: 'var(--transition-state)',
      }}>
        {on ? <span style={{ width: 6, height: 6, borderRadius: 'var(--radius-circle)', background: isDisabled ? 'var(--text-disabled)' : 'var(--text-inverse)' }} /> : null}
      </span>
      {label ? <span style={{ font: 'var(--text-body)', color: isDisabled ? 'var(--text-disabled)' : 'var(--text)' }}>{label}</span> : null}
    </label>
  );
}

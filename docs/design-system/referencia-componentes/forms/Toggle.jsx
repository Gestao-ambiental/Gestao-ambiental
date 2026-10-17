import React from 'react';

/** 28×16 toggle for an instant on/off setting. */
export function Toggle({ label, checked, defaultChecked, isDisabled = false, onChange, id, style, ...rest }) {
  const [inner, setInner] = React.useState(Boolean(defaultChecked));
  const isControlled = checked !== undefined;
  const on = isControlled ? checked : inner;
  return (
    <label
      htmlFor={id}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-100)', cursor: isDisabled ? 'not-allowed' : 'pointer', ...style }}
    >
      <input
        id={id} type="checkbox" role="switch" checked={on} disabled={isDisabled}
        onChange={(e) => { if (!isControlled) setInner(e.target.checked); if (onChange) onChange(e); }}
        {...rest}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
      />
      <span style={{
        position: 'relative', display: 'inline-block', flex: '0 0 auto', width: 28, height: 16,
        borderRadius: 'var(--radius-pill)',
        background: isDisabled ? 'var(--surface-disabled)' : on ? 'var(--brand)' : 'var(--toggle-off)',
        transition: 'background-color var(--duration-fast) var(--ease-out)',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: on ? 14 : 2, width: 12, height: 12,
          borderRadius: 'var(--radius-circle)', background: 'var(--toggle-thumb)',
          transition: 'left var(--duration-fast) var(--ease-out)',
        }} />
      </span>
      {label ? <span style={{ font: 'var(--text-body)', color: isDisabled ? 'var(--text-disabled)' : 'var(--text)' }}>{label}</span> : null}
    </label>
  );
}

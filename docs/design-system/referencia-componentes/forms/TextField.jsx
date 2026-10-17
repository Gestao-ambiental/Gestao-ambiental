import React from 'react';
import { Field } from './Field.jsx';
import { Icon } from '../core/Icon.jsx';

export function inputStyle({ focus, invalid, disabled }) {
  return {
    width: '100%', height: 'var(--size-control)',
    padding: '0 var(--space-100)',
    background: disabled ? 'var(--surface-disabled)' : focus ? 'var(--surface-input-focus)' : 'var(--surface-input)',
    color: disabled ? 'var(--text-disabled)' : 'var(--text)',
    border: `var(--border-width) solid ${invalid ? 'var(--border-danger)' : focus ? 'var(--border-focus)' : 'var(--border-input)'}`,
    boxShadow: focus ? `0 0 0 1px ${invalid ? 'var(--border-danger)' : 'var(--border-focus)'}` : 'none',
    borderRadius: 'var(--radius)',
    font: 'var(--text-body)',
    outline: 'none',
    transition: 'var(--transition-state)',
  };
}

/** 32px text input with optional label, help text and error state. */
export function TextField({
  label, help, error, isRequired = false, isDisabled = false, isInvalid = false,
  iconBefore, id, style, ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const invalid = isInvalid || Boolean(error);
  const control = (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      {iconBefore ? (
        <Icon name={iconBefore} size={16} style={{ position: 'absolute', left: 'var(--space-100)', backgroundColor: 'var(--icon-subtle)', pointerEvents: 'none' }} />
      ) : null}
      <input
        id={id} disabled={isDisabled} aria-invalid={invalid || undefined}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        {...rest}
        style={{ ...inputStyle({ focus, invalid, disabled: isDisabled }), paddingLeft: iconBefore ? 'var(--space-400)' : undefined }}
      />
    </div>
  );
  if (!label && !help && !error) return <div style={style}>{control}</div>;
  return <Field label={label} htmlFor={id} isRequired={isRequired} help={help} error={error} style={style}>{control}</Field>;
}

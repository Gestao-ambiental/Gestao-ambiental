import React from 'react';
import { Field } from './Field.jsx';
import { inputStyle } from './TextField.jsx';
import { Icon } from '../core/Icon.jsx';

/** Native select styled as a AgroFuturo control, with a chevron affordance. */
export function Select({ label, help, error, isRequired = false, isDisabled = false, isInvalid = false, options = [], placeholder, id, style, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  const invalid = isInvalid || Boolean(error);
  const control = (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <select
        id={id} disabled={isDisabled} aria-invalid={invalid || undefined}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        {...rest}
        style={{ ...inputStyle({ focus, invalid, disabled: isDisabled }), appearance: 'none', paddingRight: 'var(--space-400)', cursor: isDisabled ? 'not-allowed' : 'pointer' }}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((o) => {
          const opt = typeof o === 'string' ? { value: o, label: o } : o;
          return <option key={opt.value} value={opt.value}>{opt.label}</option>;
        })}
      </select>
      <Icon name="chevron-down" size={16} style={{ position: 'absolute', right: 'var(--space-100)', backgroundColor: 'var(--icon-subtle)', pointerEvents: 'none' }} />
    </div>
  );
  if (!label && !help && !error) return <div style={style}>{control}</div>;
  return <Field label={label} htmlFor={id} isRequired={isRequired} help={help} error={error} style={style}>{control}</Field>;
}

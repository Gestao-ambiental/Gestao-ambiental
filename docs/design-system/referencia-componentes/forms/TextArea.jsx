import React from 'react';
import { Field } from './Field.jsx';
import { inputStyle } from './TextField.jsx';

/** Multi-line input. Same visual language as TextField, taller box. */
export function TextArea({ label, help, error, isRequired = false, isDisabled = false, isInvalid = false, rows = 4, id, style, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  const invalid = isInvalid || Boolean(error);
  const control = (
    <textarea
      id={id} rows={rows} disabled={isDisabled} aria-invalid={invalid || undefined}
      onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      {...rest}
      style={{ ...inputStyle({ focus, invalid, disabled: isDisabled }), height: 'auto', padding: 'var(--space-075) var(--space-100)', resize: 'vertical', lineHeight: 'var(--line-height-100)' }}
    />
  );
  if (!label && !help && !error) return <div style={style}>{control}</div>;
  return <Field label={label} htmlFor={id} isRequired={isRequired} help={help} error={error} style={style}>{control}</Field>;
}

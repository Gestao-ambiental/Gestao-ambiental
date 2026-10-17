import React from 'react';

/** Label + help + error scaffolding shared by every form control. */
export function Field({ label, htmlFor, isRequired = false, help, error, children, style, ...rest }) {
  return (
    <div {...rest} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-050)', ...style }}>
      {label ? (
        <label htmlFor={htmlFor} style={{ font: 'var(--text-label)', color: 'var(--text-subtle)' }}>
          {label}{isRequired ? <span style={{ color: 'var(--text-danger)' }}> *</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <span style={{ font: 'var(--font-weight-regular) var(--font-size-075)/16px var(--font-family)', color: 'var(--text-danger)' }}>{error}</span>
      ) : help ? (
        <span style={{ font: 'var(--font-weight-regular) var(--font-size-075)/16px var(--font-family)', color: 'var(--text-subtle)' }}>{help}</span>
      ) : null}
    </div>
  );
}

import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { inputStyle } from './TextField.jsx';

/** Search input with a leading magnifier and a clear affordance. */
export function SearchField({ value, defaultValue = '', onChange, onClear, placeholder = 'Buscar', width = 240, isDisabled = false, style, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  const [inner, setInner] = React.useState(defaultValue);
  const isControlled = value !== undefined;
  const v = isControlled ? value : inner;
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', width, ...style }}>
      <Icon name="search" size={16} style={{ position: 'absolute', left: 'var(--space-100)', backgroundColor: 'var(--icon-subtle)', pointerEvents: 'none' }} />
      <input
        type="search" value={v} placeholder={placeholder} disabled={isDisabled}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        onChange={(e) => { if (!isControlled) setInner(e.target.value); if (onChange) onChange(e); }}
        {...rest}
        style={{ ...inputStyle({ focus, invalid: false, disabled: isDisabled }), paddingLeft: 'var(--space-400)', paddingRight: v ? 'var(--space-400)' : undefined }}
      />
      {v ? (
        <span
          role="button" aria-label="Limpar busca"
          onClick={() => { if (!isControlled) setInner(''); if (onClear) onClear(); }}
          style={{ position: 'absolute', right: 'var(--space-100)', display: 'inline-flex', cursor: 'pointer', color: 'var(--icon-subtle)' }}
        >
          <Icon name="x" size={14} />
        </span>
      ) : null}
    </div>
  );
}

import React from 'react';

const SIZES = { small: 20, medium: 24, large: 32, xlarge: 48 };
const SLOTS = 6;

/** The sigla block: a client's identity colour, in the one place brand colour is allowed. */
export function ClientMark({ name = '', sigla, slot = 1, size = 'medium', style, ...rest }) {
  const px = SIZES[size] || SIZES.medium;
  const i = ((Number(slot) - 1) % SLOTS + SLOTS) % SLOTS + 1;
  const text = (sigla || name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('')).toUpperCase().slice(0, 3);
  return (
    <span
      title={name || text}
      {...rest}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto',
        width: px, height: px,
        background: `var(--client-${i})`, color: `var(--client-${i}-text)`,
        borderRadius: 'var(--radius)',
        font: `var(--font-weight-bold) ${px >= 48 ? 16 : px >= 32 ? 13 : 11}px/1 var(--font-family)`,
        letterSpacing: '0.02em',
        ...style,
      }}
    >
      {text}
    </span>
  );
}

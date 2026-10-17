import React from 'react';

/** Dark 12px hover tooltip. Wraps its trigger; no click behaviour. */
export function Tooltip({ content, position = 'top', children, style, ...rest }) {
  const [open, setOpen] = React.useState(false);
  const pos = {
    top: { bottom: '100%', left: '50%', transform: 'translate(-50%,-6px)' },
    bottom: { top: '100%', left: '50%', transform: 'translate(-50%,6px)' },
    left: { right: '100%', top: '50%', transform: 'translate(-6px,-50%)' },
    right: { left: '100%', top: '50%', transform: 'translate(6px,-50%)' },
  }[position];
  return (
    <span
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      {...rest}
      style={{ position: 'relative', display: 'inline-flex', ...style }}
    >
      {children}
      {open && content ? (
        <span
          role="tooltip"
          style={{
            position: 'absolute', zIndex: 60, ...pos,
            background: 'var(--surface-inverse)', color: 'var(--text-on-inverse)',
            padding: 'var(--space-025) var(--space-075)',
            borderRadius: 'var(--radius)',
            font: 'var(--font-weight-regular) var(--font-size-075)/16px var(--font-family)',
            whiteSpace: 'nowrap', pointerEvents: 'none',
            boxShadow: 'var(--shadow-overlay)',
            animation: 'af-overlay-in var(--duration-fast) var(--ease-out)',
          }}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}

import React from 'react';
import { Icon } from './Icon.jsx';

/** Square icon-only button for toolbars, row actions and nav affordances. */
export function IconButton({
  icon, label, appearance = 'subtle', size = 'default',
  isDisabled = false, isSelected = false, style, onClick, ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const [press, setPress] = React.useState(false);
  const box = size === 'compact' ? 24 : 32;
  const primary = appearance === 'primary';
  let bg = primary ? 'var(--brand)' : 'transparent';
  if (!isDisabled) {
    if (press) bg = primary ? 'var(--brand-pressed)' : 'var(--neutral-subtle-pressed)';
    else if (hover) bg = primary ? 'var(--brand-hover)' : 'var(--neutral-subtle-hover)';
    if (isSelected && !primary) bg = 'var(--surface-selected)';
  }
  return (
    <button
      type="button" aria-label={label} title={label} disabled={isDisabled}
      onClick={isDisabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPress(false); }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      {...rest}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: box, height: box, padding: 0,
        background: bg,
        color: isDisabled ? 'var(--text-disabled)' : isSelected ? 'var(--text-link)' : primary ? 'var(--icon-inverse)' : 'var(--icon)',
        border: appearance === 'default' ? 'var(--border-width) solid var(--border)' : 'var(--border-width) solid transparent',
        borderRadius: 'var(--radius)',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        transition: 'var(--transition-state)',
        ...style,
      }}
    >
      <Icon name={icon} size={size === 'compact' ? 12 : 16} />
    </button>
  );
}

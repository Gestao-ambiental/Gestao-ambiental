import React from 'react';
import { Icon } from './Icon.jsx';

const APPEARANCE = {
  primary: { bg: 'var(--brand)', hover: 'var(--brand-hover)', press: 'var(--brand-pressed)', fg: 'var(--text-inverse)', border: 'transparent' },
  default: { bg: 'transparent', hover: 'var(--neutral-subtle-hover)', press: 'var(--neutral-subtle-pressed)', fg: 'var(--text)', border: 'var(--border)' },
  subtle: { bg: 'transparent', hover: 'var(--neutral-subtle-hover)', press: 'var(--neutral-subtle-pressed)', fg: 'var(--text)', border: 'transparent' },
  danger: { bg: 'var(--danger)', hover: 'var(--danger-hover)', press: 'var(--danger-pressed)', fg: 'var(--text-inverse)', border: 'transparent' },
  link: { bg: 'transparent', hover: 'transparent', press: 'transparent', fg: 'var(--text-link)', border: 'transparent' },
};

/** 32px utilitarian button. Label first, icons optional, no shadow. */
export function Button({
  appearance = 'default', size = 'default', iconBefore, iconAfter,
  isDisabled = false, isSelected = false, isFullWidth = false,
  type = 'button', children, style, onClick, ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const [press, setPress] = React.useState(false);
  const a = APPEARANCE[appearance] || APPEARANCE.default;
  const compact = size === 'compact';
  let bg = a.bg;
  if (!isDisabled) {
    if (press) bg = a.press;
    else if (hover) bg = a.hover;
    if (isSelected) bg = appearance === 'primary' ? a.press : 'var(--surface-selected)';
  }
  return (
    <button
      type={type}
      disabled={isDisabled}
      onClick={isDisabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPress(false); }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      {...rest}
      style={{
        display: isFullWidth ? 'flex' : 'inline-flex', width: isFullWidth ? '100%' : undefined,
        alignItems: 'center', justifyContent: 'center', gap: 'var(--space-050)',
        height: compact ? 'var(--size-control-sm)' : 'var(--size-control)',
        padding: appearance === 'link' ? '0 var(--space-025)' : compact ? '0 var(--space-100)' : '0 var(--space-150)',
        background: isDisabled ? (a.bg === 'transparent' ? 'transparent' : 'var(--surface-disabled)') : bg,
        color: isDisabled ? 'var(--text-disabled)' : (isSelected && appearance !== 'primary' ? 'var(--text-link)' : a.fg),
        border: `var(--border-width) solid ${isDisabled && a.border !== 'transparent' ? 'var(--border)' : a.border}`,
        borderRadius: 'var(--radius)',
        font: 'var(--text-body-medium)',
        textDecoration: appearance === 'link' && hover && !isDisabled ? 'underline' : 'none',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        transition: 'var(--transition-state)',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {iconBefore ? <Icon name={iconBefore} size={16} /> : null}
      {children}
      {iconAfter ? <Icon name={iconAfter} size={16} /> : null}
    </button>
  );
}

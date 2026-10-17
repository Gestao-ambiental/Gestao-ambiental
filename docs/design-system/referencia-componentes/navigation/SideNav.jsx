import React from 'react';
import { Icon } from '../core/Icon.jsx';

/** 240px left rail: white surface, separated by a border, never a shadow. */
export function SideNav({ children, header, footer, isCollapsed = false, style, ...rest }) {
  return (
    <nav
      {...rest}
      style={{
        display: 'flex', flexDirection: 'column',
        width: isCollapsed ? 'var(--nav-side-width-collapsed)' : 'var(--nav-side-width)',
        flex: '0 0 auto', height: '100%',
        background: 'var(--surface-nav)',
        borderRight: 'var(--border-width) solid var(--border)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {header ? <div style={{ padding: 'var(--space-150) var(--space-150) var(--space-100)' }}>{header}</div> : null}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-050) var(--space-100) var(--space-200)' }}>{children}</div>
      {footer ? <div style={{ padding: 'var(--space-100)', borderTop: 'var(--border-width) solid var(--border)' }}>{footer}</div> : null}
    </nav>
  );
}

/** Uppercase group heading inside the rail. */
export function SideNavSection({ label, children, style, ...rest }) {
  return (
    <div {...rest} style={{ marginTop: 'var(--space-200)', ...style }}>
      {label ? (
        <div style={{
          padding: 'var(--space-050) var(--space-100) var(--space-050)',
          font: 'var(--text-uppercase)', letterSpacing: 'var(--tracking-uppercase)',
          textTransform: 'uppercase', color: 'var(--text-subtlest)',
        }}>{label}</div>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>{children}</div>
    </div>
  );
}

/** One navigation row. Active state is a washed blue fill, not a bar. */
export function SideNavItem({ icon, children, isActive = false, isCollapsed = false, count, href = '#', onClick, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  return (
    <a
      href={href} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      aria-current={isActive ? 'page' : undefined}
      {...rest}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-100)',
        height: 'var(--size-control)', padding: '0 var(--space-100)',
        background: isActive ? (hover ? 'var(--surface-selected-hover)' : 'var(--surface-selected)') : hover ? 'var(--surface-hover)' : 'transparent',
        color: isActive ? 'var(--text-link)' : 'var(--text)',
        borderRadius: 'var(--radius)',
        font: isActive ? 'var(--text-body-medium)' : 'var(--text-body)',
        textDecoration: 'none', whiteSpace: 'nowrap',
        transition: 'var(--transition-state)',
        ...style,
      }}
    >
      {icon ? <Icon name={icon} size={16} style={{ backgroundColor: isActive ? 'var(--icon-brand)' : 'var(--icon)' }} /> : null}
      {!isCollapsed ? <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span> : null}
      {!isCollapsed && count !== undefined ? (
        <span style={{ font: 'var(--text-label)', color: 'var(--text-subtle)' }}>{count}</span>
      ) : null}
    </a>
  );
}

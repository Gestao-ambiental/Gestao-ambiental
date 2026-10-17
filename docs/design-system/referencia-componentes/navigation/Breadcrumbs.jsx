import React from 'react';

/** 12px trail above a screen title. */
export function Breadcrumbs({ items = [], style, ...rest }) {
  return (
    <nav
      aria-label="Breadcrumb"
      {...rest}
      style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-050)', font: 'var(--font-weight-regular) var(--font-size-075)/16px var(--font-family)', color: 'var(--text-subtle)', ...style }}
    >
      {items.map((raw, i) => {
        const it = typeof raw === 'string' ? { label: raw } : raw;
        const last = i === items.length - 1;
        return (
          <React.Fragment key={i}>
            {last || !it.href
              ? <span style={{ color: last ? 'var(--text-subtle)' : 'var(--text-link)' }}>{it.label}</span>
              : <a href={it.href} style={{ color: 'var(--text-link)' }}>{it.label}</a>}
            {!last ? <span style={{ color: 'var(--text-disabled)' }}>/</span> : null}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

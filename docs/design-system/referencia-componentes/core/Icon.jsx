import React from 'react';

const ICON_BASE = (() => {
  if (typeof document === 'undefined') return 'assets/icons/';
  const s = document.querySelector('script[src*="_ds_bundle.js"]');
  if (s) return (s.getAttribute('src') || '').replace(/_ds_bundle\.js.*$/, '') + 'assets/icons/';
  return 'assets/icons/';
})();

/** Monochrome 16px glyph. Colour comes from the surrounding text colour. */
export function Icon({ name, size = 16, color = 'currentColor', label, style, ...rest }) {
  const url = `url("${ICON_BASE}${name}.svg")`;
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      {...rest}
      style={{
        display: 'inline-block', flex: '0 0 auto', width: size, height: size,
        backgroundColor: color,
        WebkitMaskImage: url, maskImage: url,
        WebkitMaskSize: 'contain', maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center', maskPosition: 'center',
        ...style,
      }}
    />
  );
}

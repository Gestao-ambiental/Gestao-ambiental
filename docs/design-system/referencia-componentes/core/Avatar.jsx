import React from 'react';

const SIZES = { small: 20, medium: 24, large: 32, xlarge: 40 };

/** Round person avatar — image if given, otherwise initials on neutral. */
export function Avatar({ name = '', src, size = 'medium', color, presence, style, ...rest }) {
  const px = SIZES[size] || SIZES.medium;
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
  return (
    <span {...rest} style={{ position: 'relative', display: 'inline-flex', flex: '0 0 auto', ...style }}>
      <span
        title={name}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: px, height: px, borderRadius: 'var(--radius-circle)', overflow: 'hidden',
          background: color || 'var(--avatar-default)', color: color ? 'inherit' : 'var(--text-inverse)',
          font: `var(--font-weight-semibold) ${px <= 24 ? 10 : 12}px/1 var(--font-family)`,
          border: 'var(--border-width) solid var(--surface)',
        }}
      >
        {src ? <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
      </span>
      {presence ? (
        <span style={{
          position: 'absolute', right: -1, bottom: -1,
          width: px <= 24 ? 7 : 9, height: px <= 24 ? 7 : 9, borderRadius: 'var(--radius-circle)',
          background: presence === 'online' ? 'var(--presence-online)' : presence === 'busy' ? 'var(--danger)' : 'var(--presence-away)',
          border: '2px solid var(--surface)',
        }} />
      ) : null}
    </span>
  );
}

/** Overlapping stack of avatars with a +N overflow chip. */
export function AvatarGroup({ people = [], max = 4, size = 'medium', style, ...rest }) {
  const px = SIZES[size] || SIZES.medium;
  const shown = people.slice(0, max);
  const rest_ = people.length - shown.length;
  return (
    <span {...rest} style={{ display: 'inline-flex', alignItems: 'center', ...style }}>
      {shown.map((p, i) => (
        <span key={i} style={{ marginLeft: i === 0 ? 0 : -6 }}>
          <Avatar name={typeof p === 'string' ? p : p.name} src={typeof p === 'string' ? undefined : p.src} size={size} />
        </span>
      ))}
      {rest_ > 0 ? (
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: -6,
          width: px, height: px, borderRadius: 'var(--radius-circle)',
          background: 'var(--surface-hover)', color: 'var(--text-subtle)',
          border: 'var(--border-width) solid var(--surface)',
          font: `var(--font-weight-semibold) ${px <= 24 ? 10 : 12}px/1 var(--font-family)`,
        }}>+{rest_}</span>
      ) : null}
    </span>
  );
}

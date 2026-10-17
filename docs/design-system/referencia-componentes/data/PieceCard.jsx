import React from 'react';
import { ClientMark } from '../core/ClientMark.jsx';
import { Lozenge } from '../core/Lozenge.jsx';
import { Avatar } from '../core/Avatar.jsx';
import { Icon } from '../core/Icon.jsx';

/** Kanban card for one piece of content. */
export function PieceCard({
  id, title, client, clientSigla, clientSlot = 1, status, tone = 'default',
  channel, due, assignee, comments, isDragging = false, onClick, style, ...rest
}) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      {...rest}
      style={{
        display: 'flex', flexDirection: 'column', gap: 'var(--space-100)',
        padding: 'var(--space-150)',
        background: hover ? 'var(--surface-hover)' : 'var(--surface-raised)',
        border: 'var(--border-width) solid var(--border)',
        borderRadius: 'var(--radius)',
        boxShadow: isDragging ? 'var(--shadow-overlay)' : 'none',
        cursor: onClick ? 'pointer' : undefined,
        transition: 'var(--transition-state)',
        ...style,
      }}
    >
      <div style={{ display: 'flex', gap: 'var(--space-100)', alignItems: 'flex-start' }}>
        <ClientMark name={client} sigla={clientSigla} slot={clientSlot} size="medium" />
        <div style={{ font: 'var(--text-body-medium)', color: 'var(--text)', textWrap: 'pretty' }}>{title}</div>
      </div>
      {status ? <div><Lozenge tone={tone}>{status}</Lozenge></div> : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-150)', font: 'var(--font-weight-regular) var(--font-size-075)/16px var(--font-family)', color: 'var(--text-subtle)' }}>
        {id ? <span style={{ fontFamily: 'var(--font-mono)' }}>{id}</span> : null}
        {channel ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-050)' }}><Icon name={channel.icon || 'image'} size={12} style={{ backgroundColor: 'var(--icon-subtle)' }} />{channel.label}</span> : null}
        {due ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-050)' }}><Icon name="clock" size={12} style={{ backgroundColor: 'var(--icon-subtle)' }} />{due}</span> : null}
        {comments ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-050)' }}><Icon name="message-square" size={12} style={{ backgroundColor: 'var(--icon-subtle)' }} />{comments}</span> : null}
        {assignee ? <span style={{ marginLeft: 'auto' }}><Avatar name={assignee} size="small" /></span> : null}
      </div>
    </div>
  );
}

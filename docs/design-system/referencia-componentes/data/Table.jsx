import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { Checkbox } from '../forms/Checkbox.jsx';

/** Dense 40px-row table: 1px lines, hover fill, washed-blue selection. */
export function Table({
  columns = [], rows = [], getRowId = (r, i) => r.id ?? i,
  selectedIds, onToggleRow, onToggleAll, onRowClick,
  sortKey, sortDir = 'asc', onSort, isCompact = false, style, ...rest
}) {
  const [hovered, setHovered] = React.useState(null);
  const selectable = Boolean(selectedIds);
  const sel = selectedIds || [];
  const allOn = selectable && rows.length > 0 && sel.length === rows.length;
  const h = isCompact ? 'var(--row-height-compact)' : 'var(--row-height)';
  return (
    <table {...rest} style={{ width: '100%', borderCollapse: 'collapse', font: 'var(--text-body)', color: 'var(--text)', ...style }}>
      <thead>
        <tr>
          {selectable ? (
            <th style={{ ...thStyle, width: 40, paddingRight: 0 }}>
              <Checkbox checked={allOn} isIndeterminate={sel.length > 0 && !allOn} onChange={() => onToggleAll && onToggleAll(!allOn)} aria-label="Selecionar todas" />
            </th>
          ) : null}
          {columns.map((c) => (
            <th
              key={c.key}
              onClick={c.isSortable && onSort ? () => onSort(c.key) : undefined}
              style={{
                ...thStyle, width: c.width, textAlign: c.align || 'left',
                cursor: c.isSortable && onSort ? 'pointer' : undefined,
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-050)' }}>
                {c.label}
                {c.isSortable && sortKey === c.key ? <Icon name={sortDir === 'asc' ? 'chevron-up' : 'chevron-down'} size={12} style={{ backgroundColor: 'var(--icon-subtle)' }} /> : null}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const id = getRowId(row, i);
          const isSel = sel.includes(id);
          const isHov = hovered === id;
          return (
            <tr
              key={id}
              onMouseEnter={() => setHovered(id)}
              onMouseLeave={() => setHovered(null)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{
                height: h,
                background: isSel ? (isHov ? 'var(--surface-selected-hover)' : 'var(--surface-selected)') : isHov ? 'var(--surface-hover)' : 'transparent',
                cursor: onRowClick ? 'pointer' : undefined,
                transition: 'background-color var(--duration-fast) var(--ease-out)',
              }}
            >
              {selectable ? (
                <td style={{ ...tdStyle, width: 40, paddingRight: 0 }} onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={isSel} onChange={() => onToggleRow && onToggleRow(id)} aria-label="Selecionar linha" />
                </td>
              ) : null}
              {columns.map((c) => (
                <td key={c.key} style={{ ...tdStyle, textAlign: c.align || 'left' }}>
                  {c.render ? c.render(row, { isHovered: isHov }) : row[c.key]}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const thStyle = {
  padding: '0 var(--space-100)', height: 'var(--row-height-compact)',
  font: 'var(--text-label)', color: 'var(--text-subtle)',
  borderBottom: 'var(--border-width) solid var(--border)',
  textAlign: 'left', verticalAlign: 'middle', userSelect: 'none',
};

const tdStyle = {
  padding: '0 var(--space-100)',
  borderBottom: 'var(--border-width) solid var(--border)',
  verticalAlign: 'middle',
};

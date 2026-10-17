import * as React from 'react';

export interface TableColumn<Row = any> {
  key: string;
  label: React.ReactNode;
  /** CSS width, e.g. 120 or '30%'. Omit to auto-size. */
  width?: number | string;
  align?: 'left' | 'right' | 'center';
  isSortable?: boolean;
  /** Cell renderer. Falls back to row[key]. */
  render?: (row: Row, state: { isHovered: boolean }) => React.ReactNode;
}

/**
 * The workhorse list view: 40px rows, 1px separators, hover and selection fills.
 * @startingPoint section="Data" subtitle="Dense table with hover and selection" viewport="700x260"
 */
export interface TableProps<Row = any> extends Omit<React.TableHTMLAttributes<HTMLTableElement>, 'rows'> {
  columns?: TableColumn<Row>[];
  rows?: Row[];
  getRowId?: (row: Row, index: number) => string | number;
  /** Passing an array (even empty) turns on the selection column. */
  selectedIds?: Array<string | number>;
  onToggleRow?: (id: string | number) => void;
  onToggleAll?: (next: boolean) => void;
  onRowClick?: (row: Row) => void;
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  /** 32px rows for secondary tables inside a drawer. */
  isCompact?: boolean;
}

export declare function Table(props: TableProps): JSX.Element;

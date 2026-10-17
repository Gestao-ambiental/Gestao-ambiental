import * as React from 'react';

export interface MenuItem {
  label?: React.ReactNode;
  /** Icon name from assets/icons. */
  icon?: string;
  /** 'separator' draws a line; 'heading' renders an 11px uppercase group label. */
  type?: 'item' | 'separator' | 'heading';
  /** Shows a check and blue text. */
  isSelected?: boolean;
  isDisabled?: boolean;
  /** danger renders the row in red — destructive actions only. */
  tone?: 'default' | 'danger';
  /** Mono keyboard hint, right aligned. */
  shortcut?: string;
  onClick?: () => void;
}

export interface DropdownMenuProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  /** The clickable element — usually a Button or IconButton. */
  trigger?: React.ReactNode;
  /** Items, or the string '-' for a separator. */
  items?: Array<MenuItem | '-'>;
  align?: 'left' | 'right';
  width?: number;
  onSelect?: (item: MenuItem) => void;
}

export declare function DropdownMenu(props: DropdownMenuProps): JSX.Element;

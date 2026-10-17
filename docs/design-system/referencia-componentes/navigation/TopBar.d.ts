import * as React from 'react';

export interface TopBarProps extends React.HTMLAttributes<HTMLElement> {
  /** Product mark and global nav. */
  left?: React.ReactNode;
  /** Global search — grows to fill. */
  center?: React.ReactNode;
  /** Create button, notifications, help, account avatar. */
  right?: React.ReactNode;
}

export interface ProductMarkProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Accessible name. Defaults to "AgroFuturo". */
  label?: string;
  /** Lockup height in px. Default 28 (fits the 56px top bar). */
  height?: number;
}

export declare function TopBar(props: TopBarProps): JSX.Element;
export declare function ProductMark(props: ProductMarkProps): JSX.Element;

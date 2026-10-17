import * as React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  /** Optional header title — renders a 1px divider under it. */
  title?: React.ReactNode;
  /** Header-right controls, usually IconButtons. */
  actions?: React.ReactNode;
  /** none for tables and lists that manage their own padding. */
  padding?: 'default' | 'compact' | 'none';
  /** Fills on hover — for cards that are themselves links. */
  isHoverable?: boolean;
  isSelected?: boolean;
}

export declare function Card(props: CardProps): JSX.Element;

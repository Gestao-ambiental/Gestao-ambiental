import * as React from 'react';

export interface TabItem { id: string; label: string; count?: number | string }

export interface TabsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  /** Strings or {id,label,count}. */
  items?: Array<string | TabItem>;
  /** Controlled active id. */
  selected?: string;
  defaultSelected?: string;
  onSelect?: (id: string) => void;
}

export declare function Tabs(props: TabsProps): JSX.Element;

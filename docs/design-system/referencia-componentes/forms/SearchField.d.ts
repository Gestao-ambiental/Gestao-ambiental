import * as React from 'react';

export interface SearchFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'disabled' | 'type' | 'width'> {
  /** CSS width — 240 in a toolbar, '100%' in a filter panel. */
  width?: number | string;
  onClear?: () => void;
  isDisabled?: boolean;
}

export declare function SearchField(props: SearchFieldProps): JSX.Element;

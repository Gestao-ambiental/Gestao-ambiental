import * as React from 'react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'disabled' | 'type'> {
  label?: React.ReactNode;
  /** Dash state for a "select all" header that is partially selected. */
  isIndeterminate?: boolean;
  isDisabled?: boolean;
}

export declare function Checkbox(props: CheckboxProps): JSX.Element;

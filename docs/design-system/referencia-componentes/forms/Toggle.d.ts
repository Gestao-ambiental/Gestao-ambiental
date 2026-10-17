import * as React from 'react';

export interface ToggleProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'disabled' | 'type'> {
  label?: React.ReactNode;
  isDisabled?: boolean;
}

export declare function Toggle(props: ToggleProps): JSX.Element;

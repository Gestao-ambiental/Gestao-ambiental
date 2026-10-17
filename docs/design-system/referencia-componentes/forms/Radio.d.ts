import * as React from 'react';

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'disabled' | 'type'> {
  label?: React.ReactNode;
  isDisabled?: boolean;
}

export declare function Radio(props: RadioProps): JSX.Element;

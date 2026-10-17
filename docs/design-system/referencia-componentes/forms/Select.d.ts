import * as React from 'react';

export interface SelectOption { value: string; label: string }

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'disabled'> {
  label?: React.ReactNode;
  help?: React.ReactNode;
  error?: React.ReactNode;
  isRequired?: boolean;
  isDisabled?: boolean;
  isInvalid?: boolean;
  /** Strings or {value,label} pairs. */
  options?: Array<string | SelectOption>;
  /** Empty-value first option, e.g. "Selecione um cliente". */
  placeholder?: string;
}

export declare function Select(props: SelectProps): JSX.Element;

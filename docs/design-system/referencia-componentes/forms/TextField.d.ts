import * as React from 'react';

/**
 * Single-line 32px input, with the label/help/error scaffolding built in.
 */
export interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'disabled'> {
  label?: React.ReactNode;
  help?: React.ReactNode;
  /** Setting this renders the message and turns the border red. */
  error?: React.ReactNode;
  isRequired?: boolean;
  isDisabled?: boolean;
  isInvalid?: boolean;
  /** Icon name rendered inside the field, left of the text. */
  iconBefore?: string;
}

export declare function TextField(props: TextFieldProps): JSX.Element;
export declare function inputStyle(state: { focus?: boolean; invalid?: boolean; disabled?: boolean }): React.CSSProperties;

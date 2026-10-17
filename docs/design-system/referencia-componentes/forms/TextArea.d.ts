import * as React from 'react';

export interface TextAreaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'disabled'> {
  label?: React.ReactNode;
  help?: React.ReactNode;
  error?: React.ReactNode;
  isRequired?: boolean;
  isDisabled?: boolean;
  isInvalid?: boolean;
  /** Default 4. Briefing fields use 6. */
  rows?: number;
}

export declare function TextArea(props: TextAreaProps): JSX.Element;

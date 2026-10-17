import * as React from 'react';

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 12px/600 subtle label above the control. Sentence case. */
  label?: React.ReactNode;
  htmlFor?: string;
  isRequired?: boolean;
  /** 12px hint below the control. Replaced by `error` when that is set. */
  help?: React.ReactNode;
  /** Error message — also expected to be mirrored by the control's isInvalid. */
  error?: React.ReactNode;
  children?: React.ReactNode;
}

export declare function Field(props: FieldProps): JSX.Element;

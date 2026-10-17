import * as React from 'react';

export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  children?: React.ReactNode;
  /** Single inline action, e.g. "Desfazer". */
  action?: React.ReactNode;
  onDismiss?: () => void;
}

export declare function Toast(props: ToastProps): JSX.Element;

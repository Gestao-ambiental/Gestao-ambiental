import * as React from 'react';

export interface SectionMessageProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: React.ReactNode;
  children?: React.ReactNode;
  /** Usually one or two `Button appearance="link"`. */
  actions?: React.ReactNode;
  onDismiss?: () => void;
}

export declare function SectionMessage(props: SectionMessageProps): JSX.Element;

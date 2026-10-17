import * as React from 'react';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Icon name; defaults to "inbox". Rendered 24px in light grey. */
  icon?: string;
  /** One line, states the fact — "Nenhuma peça neste quadro". */
  title: React.ReactNode;
  /** One or two sentences saying what to do next. */
  description?: React.ReactNode;
  primaryAction?: React.ReactNode;
  secondaryAction?: React.ReactNode;
}

export declare function EmptyState(props: EmptyStateProps): JSX.Element;

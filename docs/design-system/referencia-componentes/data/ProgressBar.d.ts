import * as React from 'react';

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  /** Default 100. */
  max?: number;
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'neutral';
  /** 12px label above the bar, left aligned. */
  label?: React.ReactNode;
  /** 12px caption above the bar, right aligned, e.g. "8 de 12". */
  caption?: React.ReactNode;
}

export declare function ProgressBar(props: ProgressBarProps): JSX.Element;

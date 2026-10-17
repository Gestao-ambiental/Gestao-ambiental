import * as React from 'react';

export interface TooltipProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Short label — one line, no punctuation, never a sentence. */
  content: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  children?: React.ReactNode;
}

export declare function Tooltip(props: TooltipProps): JSX.Element;

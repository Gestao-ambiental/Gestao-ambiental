import * as React from 'react';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Icon name from assets/icons. */
  icon: string;
  /** Required — becomes both aria-label and the native tooltip. */
  label: string;
  appearance?: 'subtle' | 'default' | 'primary';
  /** compact is 24px with a 12px glyph. */
  size?: 'default' | 'compact';
  isDisabled?: boolean;
  isSelected?: boolean;
}

export declare function IconButton(props: IconButtonProps): JSX.Element;

import * as React from 'react';

/**
 * The AgroFuturo button: 32px tall, 3px radius, no shadow.
 */
export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> {
  /** primary = the one committing action on a screen. default = secondary, bordered. subtle = toolbar. danger = destructive. link = inline. */
  appearance?: 'primary' | 'default' | 'subtle' | 'danger' | 'link';
  /** compact is 24px, for dense toolbars and table row actions. */
  size?: 'default' | 'compact';
  /** Icon name from assets/icons, rendered before the label. */
  iconBefore?: string;
  /** Icon name rendered after the label — chevrons and external links only. */
  iconAfter?: string;
  isDisabled?: boolean;
  /** Toggled-on state for view switchers and filter buttons. */
  isSelected?: boolean;
  isFullWidth?: boolean;
  children?: React.ReactNode;
}

export declare function Button(props: ButtonProps): JSX.Element;

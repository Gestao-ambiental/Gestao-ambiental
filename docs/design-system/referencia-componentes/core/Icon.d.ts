import * as React from 'react';

export interface IconProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** File stem of an SVG in assets/icons, e.g. "search", "chevron-down". */
  name: string;
  /** Pixel box. 16 is the product default; 12 dense, 24 empty states. */
  size?: number;
  /** Any CSS colour. Defaults to currentColor so it inherits from text. */
  color?: string;
  /** Accessible name. Omit for decorative icons — they are aria-hidden. */
  label?: string;
}

export declare function Icon(props: IconProps): JSX.Element;

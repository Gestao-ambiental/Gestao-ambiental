import * as React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLSpanElement> {
  width?: number | string;
  height?: number | string;
  /** CSS radius. Pass 'var(--radius-circle)' for avatar placeholders. */
  radius?: string;
}

export interface SkeletonRowsProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of placeholder rows. Default 4. */
  rows?: number;
  height?: number | string;
}

export declare function Skeleton(props: SkeletonProps): JSX.Element;
export declare function SkeletonRows(props: SkeletonRowsProps): JSX.Element;

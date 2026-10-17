import * as React from 'react';

export interface TagProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
  /** Optional 6px dot — pass a client identity token like var(--client-1). */
  color?: string;
  /** Renders a remove affordance. Omit for read-only tags. */
  onRemove?: (e: React.MouseEvent) => void;
  /** Makes the tag a link (filter by this label). */
  href?: string;
}

export declare function Tag(props: TagProps): JSX.Element;

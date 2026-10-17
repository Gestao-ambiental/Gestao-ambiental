import * as React from 'react';

export interface BreadcrumbItem { label: string; href?: string }

export interface BreadcrumbsProps extends React.HTMLAttributes<HTMLElement> {
  /** Strings or {label,href}. The last item is the current page and never a link. */
  items?: Array<string | BreadcrumbItem>;
}

export declare function Breadcrumbs(props: BreadcrumbsProps): JSX.Element;

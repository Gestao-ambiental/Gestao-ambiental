import * as React from 'react';

/**
 * The product's left rail — client switcher on top, sections below.
 */
export interface SideNavProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
  /** Usually the client switcher (ClientMark + name + chevron). */
  header?: React.ReactNode;
  /** Bottom-pinned block: help, settings, theme toggle. */
  footer?: React.ReactNode;
  isCollapsed?: boolean;
}

export interface SideNavSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 11px uppercase group heading, e.g. "PRODUÇÃO". */
  label?: React.ReactNode;
  children?: React.ReactNode;
}

export interface SideNavItemProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  /** Icon name from assets/icons. */
  icon?: string;
  isActive?: boolean;
  isCollapsed?: boolean;
  /** Right-aligned count, e.g. pending approvals. */
  count?: number | string;
  children?: React.ReactNode;
}

export declare function SideNav(props: SideNavProps): JSX.Element;
export declare function SideNavSection(props: SideNavSectionProps): JSX.Element;
export declare function SideNavItem(props: SideNavItemProps): JSX.Element;

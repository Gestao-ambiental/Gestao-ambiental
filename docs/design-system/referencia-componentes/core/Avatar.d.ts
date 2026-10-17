import * as React from 'react';

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Full name — initials are derived from the first two words. */
  name?: string;
  /** Photo URL. Falls back to initials when absent. */
  src?: string;
  size?: 'small' | 'medium' | 'large' | 'xlarge';
  /** Background override. The ONLY sanctioned use is a client identity token in the account switcher. */
  color?: string;
  presence?: 'online' | 'busy' | 'offline';
}

export interface AvatarGroupProps extends React.HTMLAttributes<HTMLSpanElement> {
  people?: Array<string | { name: string; src?: string }>;
  /** Avatars shown before collapsing into +N. Default 4. */
  max?: number;
  size?: 'small' | 'medium' | 'large' | 'xlarge';
}

export declare function Avatar(props: AvatarProps): JSX.Element;
export declare function AvatarGroup(props: AvatarGroupProps): JSX.Element;

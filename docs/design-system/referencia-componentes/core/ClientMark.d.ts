import * as React from 'react';

/**
 * Client identity block — the single sanctioned appearance of the identity palette.
 */
export interface ClientMarkProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Client name — the sigla is derived from it when `sigla` is omitted. */
  name?: string;
  /** Explicit 2–3 letter sigla. */
  sigla?: string;
  /** Identity slot 1–6, assigned per client and stable forever. Wraps past 6. */
  slot?: number;
  size?: 'small' | 'medium' | 'large' | 'xlarge';
}

export declare function ClientMark(props: ClientMarkProps): JSX.Element;

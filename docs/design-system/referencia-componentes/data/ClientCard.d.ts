import * as React from 'react';

/**
 * A client account tile — the sigla block is the one branded element in AgroFuturo.
 */
export interface ClientCardProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  /** 2–3 letter sigla; derived from the name when omitted. */
  sigla?: string;
  /** Identity slot 1–6. */
  slot?: number;
  /** One line of secondary info, e.g. "Contrato mensal · 12 peças/mês". */
  meta?: React.ReactNode;
  /** Up to three {label,value} counts shown under a divider. */
  stats?: Array<{ label: string; value: React.ReactNode }>;
}

export declare function ClientCard(props: ClientCardProps): JSX.Element;

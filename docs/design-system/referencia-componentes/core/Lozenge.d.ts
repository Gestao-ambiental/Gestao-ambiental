import * as React from 'react';

/**
 * Status of a piece of content, in the five production stages plus review.
 */
export interface LozengeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** default = Briefing, inprogress = Em produção, review = Em revisão, warning = Aguardando aprovação, success = Aprovado/Publicado, danger = Atrasado. */
  tone?: 'default' | 'inprogress' | 'review' | 'success' | 'warning' | 'danger';
  children?: React.ReactNode;
}

export declare function Lozenge(props: LozengeProps): JSX.Element;

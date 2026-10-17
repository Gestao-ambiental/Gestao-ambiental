import * as React from 'react';

/**
 * One content piece on the kanban board.
 */
export interface PieceCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Short key, e.g. "MNT-1042" — rendered in mono. */
  id?: string;
  title: React.ReactNode;
  client?: string;
  clientSigla?: string;
  clientSlot?: number;
  /** Status label; pair with the matching `tone`. */
  status?: string;
  tone?: 'default' | 'inprogress' | 'review' | 'success' | 'warning' | 'danger';
  /** {icon,label} — e.g. {icon:'image',label:'Carrossel'}. */
  channel?: { icon?: string; label?: string };
  /** Short due date, e.g. "12 ago". */
  due?: string;
  /** Assignee name — renders a small avatar on the right. */
  assignee?: string;
  comments?: number;
  /** Adds the overlay shadow while the card is being dragged. */
  isDragging?: boolean;
}

export declare function PieceCard(props: PieceCardProps): JSX.Element;

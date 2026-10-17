import * as React from 'react';

export interface ModalProps extends React.HTMLAttributes<HTMLDivElement> {
  isOpen?: boolean;
  /** 20px/600 dialog title. */
  title?: React.ReactNode;
  children?: React.ReactNode;
  /** Footer buttons, right aligned — primary last. */
  actions?: React.ReactNode;
  /** Max width in px. 400 confirm, 480 default, 720 forms. */
  width?: number;
  onClose?: () => void;
}

export declare function Modal(props: ModalProps): JSX.Element | null;

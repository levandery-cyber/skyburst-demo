'use client';

import { useEffect, useRef } from 'react';
import { Close } from './Icons';

// Built on the native <dialog>: focus trapping, Escape and the backdrop come for free.
export default function Modal({ open, onClose, title, wide = false, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={wide ? 'modal modal--wide' : 'modal'}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal__box">
        <header className="modal__head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Close />
          </button>
        </header>
        <div className="modal__body">{open ? children : null}</div>
      </div>
    </dialog>
  );
}
